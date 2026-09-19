import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { canonicalJson } from '../contracts/canonical';
import { WorkshopEvent } from '../contracts/events';
import { Id, Timestamp } from '../contracts/primitives';
import { Incident } from '../contracts/records';

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
      `);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  close(): void { this.db.close(); }

  private transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
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

  private writeOperation(input: DispatchOperation): DispatchOperation {
    const operation = DispatchOperation.parse(input);
    this.db.prepare('UPDATE operations SET record = ? WHERE id = ?').run(canonicalJson(operation), operation.id);
    return operation;
  }
}
