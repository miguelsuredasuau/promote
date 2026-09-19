import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { canonicalJson } from '../contracts/canonical';
import { WorkshopEvent } from '../contracts/events';
import { Id, Timestamp } from '../contracts/primitives';
import { Incident, sameAcceptanceIdentity, type AcceptanceIdentity, type IncidentStatus } from '../contracts/records';
import { transitionIncident, type TransitionContext } from '../contracts/state';
import { authorizeEngineering } from '../contracts/mandate';
import { hashCanonical } from '../contracts/hash';
import { isTerminal } from '../contracts/lifecycle';
import { OwnerDecisionInput, decisionRevision } from './owner-decisions';
import { Proposal, WorkItem } from '../contracts/orchestration';

const OperationIntent = z.object({ id: Id, incidentId: Id, harnessId: Id }).strict();
export const OperationOutcome = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('created'), remoteId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('unknown_outcome'), reason: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('rejected'), reason: z.string().min(1) }).strict(),
]);
export type OperationOutcome = z.infer<typeof OperationOutcome>;
/** Create-only local send ledger, not a ProviderOperation contract record.
 * pending maps to intent_recorded, in_flight to sent, created to confirmed,
 * unknown_outcome to unknown_outcome. rejected has no exact contract mapping:
 * it is a known rejection after send, never failed_before_send.
 */
export const DispatchOperation = OperationIntent.extend({
  status: z.enum(['pending', 'in_flight', 'created', 'unknown_outcome', 'rejected']),
  claimToken: Id.nullable(),
  workerId: Id.nullable(),
  outcome: OperationOutcome.nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
}).strict().superRefine((op, ctx) => {
  const pending = op.status === 'pending';
  if (pending !== (op.claimToken === null) || pending !== (op.workerId === null)) {
    ctx.addIssue({ code: 'custom', message: 'Only pending operations lack claim ownership' });
  }
  const unfinished = pending || op.status === 'in_flight';
  if (unfinished ? op.outcome !== null : op.outcome?.kind !== op.status) {
    ctx.addIssue({ code: 'custom', message: 'Outcome must match operation status' });
  }
});
export type DispatchOperation = z.infer<typeof DispatchOperation>;

export class StoreConflictError extends Error {}

/** Local controller storage. No provider calls, leases, automatic retries or reconciliation. */
export class ControllerStore {
  private readonly db: DatabaseSync;
  private transactionDepth = 0;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    try {
      this.db.exec(`
        PRAGMA busy_timeout = 5000;
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = FULL;
        CREATE TABLE IF NOT EXISTS incidents (
          id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE,
          canonical_request TEXT NOT NULL, record TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS events (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          incident_id TEXT NOT NULL REFERENCES incidents(id), record TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS operations (
          id TEXT PRIMARY KEY, incident_id TEXT NOT NULL REFERENCES incidents(id),
          record TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS inbox (
          source_key TEXT PRIMARY KEY, digest TEXT NOT NULL, record TEXT NOT NULL,
          incident_id TEXT REFERENCES incidents(id), disposition TEXT NOT NULL, received_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS engineering_mandates (id TEXT PRIMARY KEY, record TEXT NOT NULL) STRICT;
        CREATE TABLE IF NOT EXISTS engineering_reservations (
          incident_id TEXT PRIMARY KEY REFERENCES incidents(id), mandate_id TEXT NOT NULL REFERENCES engineering_mandates(id),
          task_hash TEXT NOT NULL, max_acu INTEGER NOT NULL, state TEXT NOT NULL, record TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS service_events (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT, occurred_at TEXT NOT NULL,
          category TEXT NOT NULL, summary TEXT NOT NULL, details TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS owner_decisions (proposal_id TEXT NOT NULL, revision TEXT NOT NULL, record TEXT NOT NULL, PRIMARY KEY(proposal_id, revision)) STRICT;
        CREATE TABLE IF NOT EXISTS service_state (id TEXT PRIMARY KEY, record TEXT NOT NULL) STRICT;
        CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, record TEXT NOT NULL) STRICT;
        CREATE TABLE IF NOT EXISTS proposal_sources (proposal_id TEXT NOT NULL REFERENCES proposals(id), source_key TEXT NOT NULL REFERENCES inbox(source_key), PRIMARY KEY(proposal_id,source_key)) STRICT;
        CREATE TABLE IF NOT EXISTS work_queue (id TEXT PRIMARY KEY, state TEXT NOT NULL, token TEXT, record TEXT NOT NULL) STRICT;
        CREATE TABLE IF NOT EXISTS chat_progress (
          source_key TEXT PRIMARY KEY, run_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
          digest TEXT NOT NULL, record TEXT NOT NULL
        ) STRICT;
        CREATE TABLE IF NOT EXISTS jobs (
          incident_id TEXT PRIMARY KEY REFERENCES incidents(id), state TEXT NOT NULL,
          token TEXT, record TEXT NOT NULL
        ) STRICT;
      `);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  close(): void { this.db.close(); }

  private transaction<T>(action: () => T): T {
    const savepoint = `tx_${randomUUID().replaceAll('-', '')}`;
    const outer = this.transactionDepth === 0;
    if (outer) this.db.exec('BEGIN IMMEDIATE');
    this.db.exec(`SAVEPOINT ${savepoint}`);
    this.transactionDepth++;
    try {
      const result = action();
      this.db.exec(`RELEASE ${savepoint}`);
      if (outer) this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec(`ROLLBACK TO ${savepoint}`);
      this.db.exec(`RELEASE ${savepoint}`);
      if (outer) this.db.exec('ROLLBACK');
      throw error;
    } finally { this.transactionDepth--; }
  }

  createIncident(input: unknown): Incident {
    const incident = Incident.parse(input);
    if (incident.status !== 'received' || incident.revision !== 0 || incident.block !== null ||
        incident.cancellation !== null || incident.acceptedIdentity !== null) {
      throw new Error('Intake requires a fresh received incident at revision 0');
    }
    // Generated identity/times may change on retry. All request and frozen fields must match.
    const { id: _id, createdAt: _created, updatedAt: _updated, trigger, ...request } = incident;
    const canonical = canonicalJson({ ...request, trigger: { kind: trigger.kind, idempotencyKey: trigger.idempotencyKey } });
    return this.transaction(() => {
      const existing = this.db.prepare('SELECT canonical_request, record FROM incidents WHERE idempotency_key = ?')
        .get(trigger.idempotencyKey);
      if (existing) {
        if (existing.canonical_request !== canonical) throw new StoreConflictError('Idempotency key has a different request');
        return Incident.parse(JSON.parse(String(existing.record)));
      }
      if (this.getIncident(incident.id)) throw new StoreConflictError('Incident ID already exists');
      this.db.prepare('INSERT INTO incidents VALUES (?, ?, ?, ?)')
        .run(incident.id, trigger.idempotencyKey, canonical, canonicalJson(incident));
      this.appendEvent(incident.id, 'incident.received', {}, incident.createdAt);
      return incident;
    });
  }

  getIncident(id: string): Incident | null {
    const row = this.db.prepare('SELECT record FROM incidents WHERE id = ?').get(Id.parse(id));
    return row ? Incident.parse(JSON.parse(String(row.record))) : null;
  }

  eventsAfter(sequence: number, limit = 100): WorkshopEvent[] {
    z.number().int().safe().nonnegative().parse(sequence);
    z.number().int().min(1).max(1000).parse(limit);
    return this.db.prepare('SELECT sequence, record FROM events WHERE sequence > ? ORDER BY sequence LIMIT ?').all(sequence, limit)
      .map((row) => WorkshopEvent.parse({ ...JSON.parse(String(row.record)), sequence: row.sequence }));
  }

  private appendEvent(incidentId: string, type: WorkshopEvent['type'], payload: Record<string, unknown>, occurredAt: string): void {
    const { sequence: _sequence, ...record } = WorkshopEvent.parse({
      eventId: randomUUID(), sequence: 1, schemaVersion: 1, incidentId, type, payload, occurredAt, actor: 'controller',
    });
    this.db.prepare('INSERT INTO events (incident_id, record) VALUES (?, ?)').run(incidentId, canonicalJson(record));
    this.recordActivity('orchestration', type, { incidentId, ...payload });
  }

  enqueueOperation(input: unknown): DispatchOperation {
    const intent = OperationIntent.parse(input);
    return this.transaction(() => {
      const existing = this.getOperation(intent.id);
      if (existing) {
        if (existing.incidentId !== intent.incidentId || existing.harnessId !== intent.harnessId) {
          throw new StoreConflictError('Operation ID has a different intent');
        }
        return existing;
      }
      const prior = this.db.prepare('SELECT id FROM operations WHERE incident_id = ?').get(intent.incidentId);
      if (prior) throw new StoreConflictError('Incident already has a create operation; reuse its identity');
      const incident = this.getIncident(intent.incidentId);
      if (!incident || isTerminal(incident.status) || incident.cancellation) throw new StoreConflictError('Incident cannot dispatch');
      const now = new Date().toISOString();
      const operation = DispatchOperation.parse({ ...intent, status: 'pending', claimToken: null,
        workerId: null, outcome: null, createdAt: now, updatedAt: now });
      this.db.prepare('INSERT INTO operations VALUES (?, ?, ?)').run(intent.id, intent.incidentId, canonicalJson(operation));
      this.appendEvent(intent.incidentId, 'dispatch.pending', { operationId: intent.id, harnessId: intent.harnessId }, now);
      return operation;
    });
  }

  getOperation(id: string): DispatchOperation | null {
    const row = this.db.prepare('SELECT record FROM operations WHERE id = ?').get(Id.parse(id));
    return row ? DispatchOperation.parse(JSON.parse(String(row.record))) : null;
  }

  /** Only the returned claim authorizes a send. Time passage never makes a second claim safe. */
  claimOperation(id: string, workerId: string): DispatchOperation | null {
    Id.parse(id);
    Id.parse(workerId);
    return this.transaction(() => {
      const operation = this.getOperation(id);
      if (!operation || operation.status !== 'pending') return null;
      const incident = this.getIncident(operation.incidentId);
      if (!incident || isTerminal(incident.status) || incident.cancellation) return null;
      const competing = this.db.prepare("SELECT id FROM operations WHERE incident_id = ? AND id != ?").all(operation.incidentId, id);
      if (competing.length) throw new StoreConflictError('Multiple legacy create intents require reconciliation');
      return this.writeOperation({ ...operation, status: 'in_flight', claimToken: randomUUID(), workerId,
        updatedAt: new Date().toISOString() });
    });
  }

  /** Rejection is a known provider response; it does not authorize a retry in this slice. */
  completeOperation(id: string, claimToken: string, input: unknown): DispatchOperation {
    Id.parse(id);
    Id.parse(claimToken);
    const outcome = OperationOutcome.parse(input);
    return this.transaction(() => {
      const operation = this.getOperation(id);
      if (!operation || operation.claimToken !== claimToken) throw new StoreConflictError('Operation claim does not match');
      if (operation.status !== 'in_flight') {
        if (canonicalJson(operation.outcome) === canonicalJson(outcome)) return operation;
        throw new StoreConflictError('Operation already has a different outcome');
      }
      const result = this.writeOperation({ ...operation, status: outcome.kind, outcome, updatedAt: new Date().toISOString() });
      if (outcome.kind === 'created') this.appendEvent(operation.incidentId, 'session.created',
        { operationId: id, remoteSessionId: outcome.remoteId }, result.updatedAt);
      return result;
    });
  }

  /** One consistent, bounded read for the operator UI. Claim tokens stay server-side. */
  operatorSnapshot(): { incidents: Incident[]; operations: Omit<DispatchOperation, 'claimToken'>[]; events: WorkshopEvent[] } {
    return this.transaction(() => {
      const incidents = this.db.prepare('SELECT record FROM incidents ORDER BY rowid DESC LIMIT 100').all()
        .map((row) => Incident.parse(JSON.parse(String(row.record))));
      const operations = this.db.prepare('SELECT record FROM operations ORDER BY rowid DESC LIMIT 100').all()
        .map((row) => {
          const { claimToken: _claim, ...operation } = DispatchOperation.parse(JSON.parse(String(row.record)));
          return operation;
        });
      const events = this.db.prepare('SELECT sequence, record FROM events ORDER BY sequence DESC LIMIT 100').all()
        .reverse().map((row) => WorkshopEvent.parse({ ...JSON.parse(String(row.record)), sequence: row.sequence }));
      return { incidents, operations, events };
    });
  }


  /** Server-owned mutation; never expose TransitionContext as a client request. */
  advance(id: string, revision: number, to: IncidentStatus, context: TransitionContext,
    events: { type: WorkshopEvent['type']; payload: Record<string, unknown> }[] = []): Incident {
    return this.transaction(() => {
      const current = this.getIncident(id);
      if (!current || current.revision !== revision) throw new StoreConflictError('Stale incident revision');
      const result = transitionIncident({ status: current.status, block: current.block,
        cancelRequested: current.cancellation !== null, acceptedIdentity: current.acceptedIdentity }, to, context);
      if (!result.ok) throw new StoreConflictError(result.error);
      const next = Incident.parse({ ...current, status: result.state.status, block: result.state.block,
        acceptedIdentity: result.state.acceptedIdentity, revision: revision + 1, updatedAt: context.now });
      this.db.prepare('UPDATE incidents SET record = ? WHERE id = ?').run(canonicalJson(next), id);
      this.appendEvent(id, 'incident.transitioned', { from: current.status, to, revision: next.revision }, context.now);
      for (const event of events) this.appendEvent(id, event.type, event.payload, context.now);
      return next;
    });
  }

  cancel(id: string, revision: number, requestedBy: string): Incident {
    return this.transaction(() => {
      const current = this.getIncident(id);
      if (!current || current.revision !== revision || isTerminal(current.status)) throw new StoreConflictError('Stale or terminal incident');
      if (current.cancellation) return current;
      const now = new Date().toISOString();
      const next = Incident.parse({ ...current, revision: revision + 1, updatedAt: now,
        cancellation: { requestedAt: now, requestedBy } });
      this.db.prepare('UPDATE incidents SET record = ? WHERE id = ?').run(canonicalJson(next), id);
      this.appendEvent(id, 'cancel.requested', {}, now);
      return next;
    });
  }

  ingest(sourceKey: string, digest: string, record: unknown, incident: Incident | null) {
    return this.transaction(() => {
      const existing = this.db.prepare('SELECT * FROM inbox WHERE source_key = ?').get(sourceKey);
      if (existing) {
        if (existing.digest !== digest) throw new StoreConflictError('Source record changed after ingestion');
        return { incidentId: existing.incident_id as string | null, duplicate: true };
      }
      const created = incident ? this.createIncident(incident) : null;
      this.db.prepare('INSERT INTO inbox VALUES (?, ?, ?, ?, ?, ?)').run(sourceKey, digest,
        canonicalJson(record), created?.id ?? null, created ? 'incident_linked' : 'observed', new Date().toISOString());
      this.recordActivity('intake', 'Demo record received', { sourceKey, incidentId: created?.id ?? null, disposition: created ? 'incident_linked' : 'awaiting_triage' });
      return { incidentId: created?.id ?? null, duplicate: false };
    });
  }

  inboxSnapshot() {
    return this.db.prepare('SELECT source_key, incident_id, disposition, received_at, record FROM inbox ORDER BY rowid DESC LIMIT 100').all().map(row => {
      const record = JSON.parse(String(row.record));
      return { sourceKey: row.source_key, incidentId: row.incident_id, disposition: row.disposition,
        receivedAt: row.received_at, schema: record.schema, conversationId: record.conversationId,
        runId: record.runId ?? record.subject?.runId ?? record.chosen?.runId ?? record.tie?.[0]?.runId,
        kind: record.kind ?? 'run', outcome: record.outcome ?? record.value ?? 'observed',
        summary: record.request?.message ?? record.note ?? record.summary ?? '', signals: record.signals?.length ?? 0 };
    });
  }

  untriagedRecords(limit = 100) {
    z.number().int().min(1).max(1000).parse(limit);
    return this.db.prepare("SELECT source_key, record FROM inbox WHERE disposition = 'observed' ORDER BY rowid LIMIT ?").all(limit)
      .map(row => ({ sourceKey:String(row.source_key),record:JSON.parse(String(row.record)) }));
  }

  triageRecord(sourceKey:string, inputs:Proposal[], promptHash:string) {
    const proposals=inputs.map(p=>Proposal.parse(p));
    return this.transaction(()=>{
      const source=this.db.prepare('SELECT disposition FROM inbox WHERE source_key=?').get(sourceKey);
      if(!source || source.disposition!=='observed')return false;
      for(const proposal of proposals){
        const old=this.db.prepare('SELECT record FROM proposals WHERE id=?').get(proposal.id);
        if(!old)this.db.prepare('INSERT INTO proposals VALUES (?,?)').run(proposal.id,canonicalJson({...proposal,status:'proposed',createdAt:new Date().toISOString(),executionMode:'local_rules',promptHash}));
        this.db.prepare('INSERT OR IGNORE INTO proposal_sources VALUES (?,?)').run(proposal.id,sourceKey);
      }
      this.db.prepare("UPDATE inbox SET disposition='triaged' WHERE source_key=?").run(sourceKey);
      this.recordActivity('orchestration','Feedback analyst triaged record',{sourceKey,proposalIds:proposals.map(p=>p.id),executionMode:'local_rules',promptHash});
      return true;
    });
  }

  proposals() {
    return this.db.prepare('SELECT record FROM proposals ORDER BY rowid').all().map(row=>{
      const p=JSON.parse(String(row.record));
      return {...p,sources:this.db.prepare('SELECT source_key FROM proposal_sources WHERE proposal_id=? ORDER BY source_key').all(p.id).map(r=>String(r.source_key))};
    });
  }

  ownerDecisions() {
    return this.db.prepare('SELECT record FROM owner_decisions ORDER BY rowid DESC').all().map(r => JSON.parse(String(r.record)));
  }

  decideProposal(input: unknown) {
    const decision = OwnerDecisionInput.parse(input);
    return this.transaction(() => {
      const proposal = this.proposals().find(p => p.id === decision.proposalId);
      if (!proposal || decisionRevision(proposal) !== decision.revision) throw new StoreConflictError('Proposal changed. Review the latest evidence.');
      const previous = this.ownerDecisions().find(d => d.proposalId === decision.proposalId && d.revision === decision.revision);
      if (previous) {
        if (previous.action === decision.action && previous.feedback === decision.feedback) return previous;
        throw new StoreConflictError('This revision already has an owner decision.');
      }
      const workId = decision.action === 'approve_plan' ? `owner-plan:${decision.revision}` : null;
      const record = { ...decision, title: proposal.title, decidedAt: new Date().toISOString(), actor: 'local_owner', workId,
        authority: { planningOnly: true, paidDispatch: false, repositoryWrites: false, release: false } };
      this.db.prepare('INSERT INTO owner_decisions VALUES (?,?,?)').run(proposal.id, decision.revision, canonicalJson(record));
      if (workId) this.enqueueWork({ id: workId, kind: 'proposal_assessment', role: 'product', lane: 'discovery', priority: proposal.priority,
        payload: { proposalId: proposal.id, ownerDecision: decision.revision, approvedProposal: proposal }, promptHash: decision.revision });
      this.recordActivity('owner_decision', decision.action === 'approve_plan' ? 'Owner commissioned a planning brief' : decision.action === 'reject' ? 'Owner declined proposal' : 'Owner requested changes', record);
      return record;
    });
  }

  enqueueWork(input:WorkItem) {
    const item=WorkItem.parse(input);
    return this.transaction(()=>{
      const existing=this.db.prepare('SELECT id FROM work_queue WHERE id=?').get(item.id);
      if(existing)return false;
      this.db.prepare('INSERT INTO work_queue VALUES (?, ?, NULL, ?)').run(item.id,'queued',canonicalJson({...item,createdAt:new Date().toISOString(),result:null}));
      this.recordActivity('orchestration','Work assigned',{workId:item.id,role:item.role,kind:item.kind,lane:item.lane,executionMode:item.role==='engineer'?'provider':'local_rules'});
      return true;
    });
  }

  workQueue() {
    return this.db.prepare('SELECT state, record FROM work_queue ORDER BY rowid').all().map(row=>({...JSON.parse(String(row.record)),state:String(row.state)}));
  }

  claimWork(now=Date.now()) {
    return this.transaction(()=>{
      // An interrupted worker retains its slot until explicit reconciliation.
      if(this.db.prepare("SELECT id FROM work_queue WHERE state='running' LIMIT 1").get())return null;
      const all=this.workQueue().filter(w=>w.state==='queued');
      if(!all.length)return null;
      const completed=Number(this.db.prepare("SELECT COUNT(*) AS n FROM work_queue WHERE state IN ('completed','blocked')").get()!.n);
      const recovery=all.filter(w=>w.kind==='candidate_review');
      const discovery=all.filter(w=>w.lane==='discovery');
      const choices=recovery.length?recovery:(completed%5===4&&discovery.length?discovery:all);
      const score=(w:any)=>w.priority+Math.min(20,Math.floor((now-Date.parse(w.createdAt))/3600000));
      choices.sort((a,b)=>score(b)-score(a)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
      const item=choices[0],token=randomUUID();
      this.db.prepare("UPDATE work_queue SET state='running', token=? WHERE id=? AND state='queued'").run(token,item.id);
      this.recordActivity('orchestration','Role started work',{workId:item.id,role:item.role,promptHash:item.promptHash});
      return {...item,token};
    });
  }

  finishWork(id:string,token:string,state:'completed'|'blocked',result:Record<string,unknown>) {
    this.transaction(()=>{
      const row=this.db.prepare("SELECT record FROM work_queue WHERE id=? AND state='running' AND token=?").get(id,token);
      if(!row)throw new StoreConflictError('Work claim does not match');
      const item=JSON.parse(String(row.record));
      this.db.prepare('UPDATE work_queue SET state=?,token=NULL,record=? WHERE id=?').run(state,canonicalJson({...item,result,finishedAt:new Date().toISOString()}),id);
      this.recordActivity('orchestration',state==='blocked'?'Role requires follow-up':'Role completed work',{workId:id,role:item.role,result});
    });
  }

  incidentEvents(id: string, after = 0, limit = 100): WorkshopEvent[] {
    Id.parse(id); z.number().int().nonnegative().parse(after); z.number().int().min(1).max(1000).parse(limit);
    return this.db.prepare('SELECT sequence, record FROM events WHERE incident_id = ? AND sequence > ? ORDER BY sequence LIMIT ?').all(id, after, limit)
      .map(row => WorkshopEvent.parse({ ...JSON.parse(String(row.record)), sequence: row.sequence }));
  }

  putJob(incidentId: string, record: unknown): void {
    this.transaction(() => {
      const prior = this.job(incidentId);
      if (prior) {
        if (canonicalJson(prior.record) !== canonicalJson(record)) throw new StoreConflictError('Job already exists');
        return;
      }
      this.db.prepare("INSERT INTO jobs VALUES (?, 'queued', NULL, ?)").run(incidentId, canonicalJson(record));
    });
  }

  job(id: string): { state: string; record: any } | null {
    const row = this.db.prepare('SELECT state, record FROM jobs WHERE incident_id = ?').get(id);
    return row ? { state: String(row.state), record: JSON.parse(String(row.record)) } : null;
  }

  claimJob(id: string): string | null {
    return this.transaction(() => {
      // One execution slot; an abandoned claim remains held, never expired into a duplicate side effect.
      if (this.db.prepare("SELECT incident_id FROM jobs WHERE state IN ('running', 'held') LIMIT 1").get()) return null;
      const token = randomUUID();
      const result = this.db.prepare("UPDATE jobs SET state = 'running', token = ? WHERE incident_id = ? AND state = 'queued'").run(token, id);
      if (result.changes === 1) this.recordActivity('orchestration', 'Workflow step claimed', { incidentId: id, executionMode: this.job(id)?.record.config?.mode });
      return result.changes === 1 ? token : null;
    });
  }

  finishJob(id: string, token: string, state: 'queued' | 'done' | 'held', record: unknown, commit?: () => void) {
    this.transaction(() => {
      const result = this.db.prepare("UPDATE jobs SET state = ?, record = ?, token = NULL WHERE incident_id = ? AND state = 'running' AND token = ?")
        .run(state, canonicalJson(record), id, token);
      if (result.changes !== 1) throw new StoreConflictError('Job claim does not match');
      commit?.();
      const work = record as { phase?: string; failure?: string; config?: { mode?: string } };
      this.recordActivity('orchestration', state === 'held' ? 'Workflow held for reconciliation' : 'Workflow step persisted', { incidentId: id, state, phase: work.phase ?? null, reason: work.failure ?? null, executionMode: work.config?.mode ?? 'unknown' });
    });
  }

  jobSnapshots() {
    return this.db.prepare('SELECT incident_id, state, record FROM jobs ORDER BY rowid DESC LIMIT 100').all()
      .map(row => ({ incidentId: String(row.incident_id), state: String(row.state), ...JSON.parse(String(row.record)) }));
  }

  ingestProgress(runId: string, ordinal: number, digest: string, record: unknown) {
    return this.transaction(() => {
      const key = `${runId}:${ordinal}`;
      const prior = this.db.prepare('SELECT digest FROM chat_progress WHERE source_key = ?').get(key);
      if (prior) { if (prior.digest !== digest) throw new StoreConflictError('Progress history changed'); return false; }
      this.db.prepare('INSERT INTO chat_progress VALUES (?, ?, ?, ?, ?)').run(key, runId, ordinal, digest, canonicalJson(record));
      if ((record as {t?:string}).t !== 'text') this.recordActivity('chat_progress', 'Chat progress received', { runId, ordinal, eventType: (record as {t?:string}).t ?? 'unknown' });
      return true;
    });
  }

  chatProgress(runId: string, after = 0) {
    return this.db.prepare('SELECT ordinal, record FROM chat_progress WHERE run_id = ? AND ordinal > ? ORDER BY ordinal LIMIT 100')
      .all(runId, after).map(row => ({ ordinal: row.ordinal, event: JSON.parse(String(row.record)) }));
  }

  chatActivity() {
    return this.db.prepare('SELECT run_id, MAX(ordinal) AS events FROM chat_progress GROUP BY run_id ORDER BY run_id DESC LIMIT 30').all();
  }

  reserveEngineering(mandateInput: unknown, taskInput: unknown) {
    const { mandate, task } = authorizeEngineering(mandateInput, taskInput);
    return this.transaction(() => {
      const incident = this.getIncident(task.incidentId);
      if (!incident || incident.baseCommit !== task.baseSha || incident.cancellation || isTerminal(incident.status)) throw new StoreConflictError('Incident cannot dispatch');
      const taskHash = hashCanonical(task);
      const prior = this.engineeringReservation(incident.id);
      if (prior) { if (prior.taskHash !== taskHash || prior.mandateId !== mandate.id) throw new StoreConflictError('Reservation scope changed'); return prior; }
      const oldMandate = this.db.prepare('SELECT record FROM engineering_mandates WHERE id = ?').get(mandate.id);
      if (oldMandate && oldMandate.record !== canonicalJson(mandate)) throw new StoreConflictError('Mandate revision changed');
      if (this.db.prepare("SELECT incident_id FROM engineering_reservations WHERE state != 'stopped' LIMIT 1").get()) throw new StoreConflictError('Engineering slot occupied or unresolved');
      const committed = Number(this.db.prepare('SELECT COALESCE(SUM(max_acu), 0) AS n FROM engineering_reservations WHERE mandate_id = ?').get(mandate.id)!.n);
      if (committed + mandate.maxSessionAcu > mandate.totalAcu) throw new StoreConflictError('Mandate budget exhausted');
      this.db.prepare('INSERT OR IGNORE INTO engineering_mandates VALUES (?, ?)').run(mandate.id, canonicalJson(mandate));
      if (incident.status === 'blocked') {
        if (incident.block?.fromStatus !== 'engineering' || incident.block.reason !== 'engineering_adapter_and_mandate_not_configured') throw new StoreConflictError('Block requires separate resolution');
        const resolved = Incident.parse({ ...incident, revision: incident.revision + 1, block: { ...incident.block, resolution: { decisionId: mandate.id, resolvedAt: new Date().toISOString() } } });
        this.db.prepare('UPDATE incidents SET record = ? WHERE id = ?').run(canonicalJson(resolved), incident.id);
        this.advance(incident.id, resolved.revision, 'engineering', { now: new Date().toISOString(), activeRemoteSessions: 0, activeLocalProcesses: 0 });
      } else if (incident.status !== 'engineering') throw new StoreConflictError('Incident is not ready for engineering');
      const operation = this.enqueueOperation({ id: `create:${incident.id}`, incidentId: incident.id, harnessId: 'devin' });
      const record = { incidentId: incident.id, mandateId: mandate.id, taskHash, task, operationId: operation.id,
        maxAcu: mandate.maxSessionAcu, state: 'reserved', remoteId: null, usageAcu: null, usageObservedAt: null, candidateSha: null };
      this.db.prepare('INSERT INTO engineering_reservations VALUES (?, ?, ?, ?, ?, ?)').run(incident.id, mandate.id, taskHash, mandate.maxSessionAcu, 'reserved', canonicalJson(record));
      this.recordActivity('provider', 'Engineering capacity and ACU budget reserved', { incidentId: incident.id, mandateId: mandate.id, maxAcu: mandate.maxSessionAcu, dollarCost: 'unknown' });
      return record;
    });
  }

  engineeringReservation(id: string): any | null {
    const row = this.db.prepare('SELECT record FROM engineering_reservations WHERE incident_id = ?').get(id);
    return row ? JSON.parse(String(row.record)) : null;
  }

  engineeringReservations(): any[] {
    return this.db.prepare('SELECT record FROM engineering_reservations ORDER BY rowid').all().map(row => JSON.parse(String(row.record)));
  }

  updateEngineering(id: string, patch: { state?: 'reserved' | 'running' | 'held' | 'stopped'; remoteId?: string; usageAcu?: number | null; usageObservedAt?: string; candidateSha?: string | null; reason?: string }) {
    this.transaction(() => {
      const prior = this.engineeringReservation(id);
      if (!prior) throw new StoreConflictError('Missing engineering reservation');
      if (patch.usageAcu != null && (!Number.isFinite(patch.usageAcu) || patch.usageAcu < 0)) throw new Error('Invalid usage');
      // Cumulative observations never add repeatedly, and stale/lower values never refund budget.
      const record = { ...prior, ...patch, usageAcu: patch.usageAcu == null ? prior.usageAcu : Math.max(prior.usageAcu ?? 0, patch.usageAcu) };
      this.db.prepare('UPDATE engineering_reservations SET state = ?, record = ? WHERE incident_id = ?').run(record.state, canonicalJson(record), id);
      if (record.state !== prior.state || record.usageAcu !== prior.usageAcu || record.candidateSha !== prior.candidateSha)
        this.recordActivity('provider', 'Devin session observation', { incidentId: id, state: record.state, remoteId: record.remoteId, usageAcu: record.usageAcu, candidateSha: record.candidateSha, reason: record.reason ?? null });
    });
  }

  providerStatus(record: Record<string, unknown>) {
    this.db.prepare("INSERT INTO service_state VALUES ('provider', ?) ON CONFLICT(id) DO UPDATE SET record = excluded.record")
      .run(canonicalJson({ ...record, observedAt: new Date().toISOString() }));
  }

  engineeringSpend() {
    const records = this.engineeringReservations();
    const providerRow = this.db.prepare("SELECT record FROM service_state WHERE id = 'provider'").get();
    const provider = providerRow ? JSON.parse(String(providerRow.record)) : {};
    const usage = records.some(r => r.usageAcu === null) ? null : records.reduce((n, r) => n + r.usageAcu, 0);
    return { unit: 'ACU', committedCeilings: records.reduce((n, r) => n + r.maxAcu, 0),
      reportedUsage: usage,
      estimatedDollarCost: usage !== null && provider.usdPerAcu > 0 ? Math.round(usage * provider.usdPerAcu * 100) / 100 : null,
      estimateRateSource: provider.rateSource ?? null,
      knownReportedUsage: records.reduce((n, r) => n + (r.usageAcu ?? 0), 0), unknownSessions: records.filter(r => r.usageAcu === null).length,
      dollarCost: null, dollarCostReason: 'account_rate_not_verified', sessions: records.map(r => ({ incidentId: r.incidentId, remoteId: r.remoteId,
        state: r.state, ceilingAcu: r.maxAcu, reportedAcu: r.usageAcu, observedAt: r.usageObservedAt,
        candidateSha: r.candidateSha, reason: r.reason ?? null })) };
  }

  recordActivity(category: string, summary: string, details: Record<string, unknown> = {}) {
    this.transaction(() => {
      this.db.prepare('INSERT INTO service_events (occurred_at, category, summary, details) VALUES (?, ?, ?, ?)')
        .run(new Date().toISOString(), category, summary, canonicalJson(details));
    });
  }

  serviceHeartbeat(record: Record<string, unknown>) {
    this.db.prepare("INSERT INTO service_state VALUES ('intake', ?) ON CONFLICT(id) DO UPDATE SET record = excluded.record")
      .run(canonicalJson({ ...record, checkedAt: new Date().toISOString() }));
  }

  deliveryStatus(record: Record<string, unknown>) {
    this.db.prepare("INSERT INTO service_state VALUES ('delivery', ?) ON CONFLICT(id) DO UPDATE SET record = excluded.record")
      .run(canonicalJson({ ...record, checkedAt: new Date().toISOString() }));
  }

  serviceSnapshot() {
    const state = this.db.prepare("SELECT record FROM service_state WHERE id = 'intake'").get();
    const count = (table: string) => Number(this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n);
    const jobs = this.db.prepare('SELECT state, COUNT(*) AS count FROM jobs GROUP BY state').all();
    return { observedAt: new Date().toISOString(), intake: state ? JSON.parse(String(state.record)) : { status: 'not_started' },
      receivedRecords: count('inbox'), progressEvents: count('chat_progress'), incidents: count('incidents'), jobs,
      provider: (() => { const row = this.db.prepare("SELECT record FROM service_state WHERE id = 'provider'").get(); return row ? JSON.parse(String(row.record)) : { status: 'not_connected', paidDispatchEnabled: false }; })(),
      engineeringSpend: this.engineeringSpend(),
      delivery: (() => { const row=this.db.prepare("SELECT record FROM service_state WHERE id='delivery'").get();return row?JSON.parse(String(row.record)):null; })(),
      objectives: this.db.prepare('SELECT record FROM incidents ORDER BY rowid DESC').all().map(row=>{
        const incident=Incident.parse(JSON.parse(String(row.record)));
        return {id:incident.id,title:incident.requestedOutcome.summary,status:incident.status};
      }),
      orchestrator: this.orchestratorHeartbeat(),
      workQueue: this.workQueue(), proposals: this.proposals(),
      explanation: 'Chat records await triage. Devin dispatch requires credentials and an approved task with an ACU ceiling. Provider usage is cumulative and may lag; dollar cost is unknown. Candidate evaluation and release remain separate steps.' };
  }

  orchestratorHeartbeat(): any | null {
    const row = this.db.prepare("SELECT record FROM service_state WHERE id = 'orchestrator'").get();
    return row ? JSON.parse(String(row.record)) : null;
  }

  reviewInputs() {
    return this.transaction(() => ({
      incidents: this.db.prepare('SELECT record FROM incidents').all().map(row => Incident.parse(JSON.parse(String(row.record)))),
      pendingRecords: Number(this.db.prepare("SELECT COUNT(*) AS n FROM inbox WHERE disposition = 'observed'").get()!.n),
      service: this.serviceSnapshot(),
    }));
  }

  saveOrchestratorHeartbeat(record: { checkedAt: string; nextCheckAt: string; actions: unknown[]; status: string; [key: string]: unknown }) {
    return this.transaction(() => {
      const prior = this.orchestratorHeartbeat();
      // Concurrent workers and restarts cannot duplicate a scheduled review.
      if (prior && Date.parse(prior.nextCheckAt) > Date.parse(record.checkedAt)) return false;
      this.db.prepare("INSERT INTO service_state VALUES ('orchestrator', ?) ON CONFLICT(id) DO UPDATE SET record = excluded.record").run(canonicalJson(record));
      this.recordActivity('orchestration', 'Scheduled project review completed', record);
      return true;
    });
  }

  activity(after = 0, limit = 100) {
    z.number().int().safe().nonnegative().parse(after); z.number().int().min(1).max(1000).parse(limit);
    return this.db.prepare('SELECT * FROM service_events WHERE sequence > ? ORDER BY sequence LIMIT ?').all(after, limit)
      .map(row => ({ sequence: row.sequence, at: row.occurred_at, category: row.category, summary: row.summary, details: JSON.parse(String(row.details)) }));
  }

  recordEvent(id: string, type: WorkshopEvent['type'], payload: Record<string, unknown>) {
    this.transaction(() => this.appendEvent(id, type, payload, new Date().toISOString()));
  }

  withReleaseAuthority(id: string, revision: number, identity: AcceptanceIdentity, publish: () => void) {
    this.transaction(() => {
      const incident = this.getIncident(id);
      if (!incident || incident.revision !== revision || incident.status !== 'releasing' || incident.cancellation ||
          !sameAcceptanceIdentity(incident.acceptedIdentity, identity)) throw new StoreConflictError('Release authority changed');
      publish();
    });
  }

  private writeOperation(input: DispatchOperation): DispatchOperation {
    const operation = DispatchOperation.parse(input);
    this.db.prepare('UPDATE operations SET record = ? WHERE id = ?').run(canonicalJson(operation), operation.id);
    return operation;
  }
}
