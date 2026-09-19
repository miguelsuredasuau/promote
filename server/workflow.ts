import { z } from 'zod';
import { ControllerStore } from './store';
import { GateProfile } from '../contracts/profile';
import { evaluateAcceptance, hashGateProfile } from '../contracts/gates';
import { Candidate, GateResult, type AcceptanceIdentity } from '../contracts/records';
import { ReleaseEnvelope } from '../contracts/integration';
import type { StartOutcome, FeedbackOutcome } from '../contracts/adapters';
import { isTerminal } from '../contracts/lifecycle';

/** Trusted ports; never populate these from chat observations or provider-provided gate verdicts. */
export interface WorkflowPorts {
  mode: 'fixture'; // Real dispatch deliberately unavailable until provider/runner mandate integration is verified.
  reproduce(incidentId: string): Promise<'reproduced' | 'refused'>;
  start(incidentId: string, operationId: string): Promise<StartOutcome>;
  candidate(remoteId: string, ordinal: number): Promise<Candidate>;
  evaluate(candidate: Candidate): Promise<GateResult[]>;
  feedback(remoteId: string, candidate: Candidate, results: GateResult[], operationId: string): Promise<FeedbackOutcome>;
  stop(remoteId: string): Promise<boolean>;
  release(identity: AcceptanceIdentity, results: GateResult[]): Promise<unknown>;
}
export const WorkflowConfig = z.object({
  mode: z.literal('fixture'), profile: GateProfile,
  maxAttempts: z.number().int().min(1).max(3), deadline: z.string().datetime(),
}).strict();
type Phase = 'reproduce' | 'start' | 'candidate' | 'evaluate' | 'feedback' | 'stop' | 'release' | 'complete';
interface Work {
  config: z.infer<typeof WorkflowConfig>; phase: Phase; ordinal: number;
  remoteId: string | null; candidate: Candidate | null; results: GateResult[];
  release?: z.infer<typeof ReleaseEnvelope>; failure?: string;
}
export function scheduleWorkflow(store: ControllerStore, id: string, input: unknown) {
  const config = WorkflowConfig.parse(input);
  const incident = store.getIncident(id);
  if (!incident || incident.status !== 'received' || incident.cancellation ||
      hashGateProfile(config.profile) !== incident.acceptanceContractHash ||
      config.profile.evaluatorRevision !== incident.evaluatorRevision || config.profile.libraryId !== incident.targetLibrary)
    throw new Error('Workflow must bind the fresh incident and frozen profile');
  store.putJob(id, { config, phase: 'reproduce', ordinal: 1, remoteId: null, candidate: null, results: [] } satisfies Work);
}

/** One durable effect per tick. Claims survive crashes; ambiguous effects require reconciliation, never expiry/retry. */
export async function tickWorkflow(store: ControllerStore, id: string, ports: WorkflowPorts): Promise<boolean> {
  const token = store.claimJob(id);
  if (!token) return false;
  const work = store.job(id)!.record as Work;
  const incident = store.getIncident(id)!;
  const now = () => new Date().toISOString();
  const ctx = () => ({ now: now(), activeRemoteSessions: work.remoteId ? 1 : 0, activeLocalProcesses: 0 });
  const save = (state: 'queued' | 'done' | 'held', commit?: () => void) => store.finishJob(id, token, state, work, commit);
  try {
    WorkflowConfig.parse(work.config);
    if (ports.mode !== work.config.mode) throw new Error('execution_mode_mismatch');
    if (isTerminal(incident.status)) { save('done'); return true; }
    const expired = Date.now() >= Date.parse(work.config.deadline);
    if (incident.cancellation || expired || work.ordinal > work.config.maxAttempts) {
      if (work.remoteId && !await ports.stop(work.remoteId)) throw new Error('termination_unconfirmed');
      work.remoteId = null;
      save('done', () => {
        // Deadline uses cancellation so every phase has a safe terminal path after confirmed stop.
        let current = store.getIncident(id)!;
        if (!current.cancellation) current = store.cancel(id, current.revision, expired ? 'controller:deadline' : 'controller:attempt_limit');
        if (current.status === 'engineering') current = store.advance(id, current.revision, 'cancel_pending', ctx());
        store.advance(id, current.revision, 'cancelled', ctx());
      });
      return true;
    }
    if (work.phase === 'reproduce') {
      const result = await ports.reproduce(id);
      work.phase = 'start';
      save(result === 'refused' ? 'done' : 'queued', () => {
        const current = store.advance(id, incident.revision, 'reproducing', ctx());
        store.advance(id, current.revision, result === 'refused' ? 'refused' : 'engineering', ctx(),
          [{ type: 'baseline.observed', payload: { outcome: result, executionMode: work.config.mode } }]);
      });
    } else if (work.phase === 'start') {
      const op = store.enqueueOperation({ id: `create:${id}`, incidentId: id, harnessId: 'fixture' });
      const claim = store.claimOperation(op.id, 'workflow');
      if (!claim) throw new Error('dispatch_requires_reconciliation');
      let outcome: StartOutcome;
      try { outcome = await ports.start(id, op.id); }
      catch { outcome = { kind: 'unknown_outcome', reason: 'transport_unknown' }; }
      store.completeOperation(op.id, claim.claimToken!, outcome);
      if (outcome.kind !== 'created') throw new Error(`dispatch_${outcome.kind}`);
      work.remoteId = outcome.remoteId; work.phase = 'candidate'; save('queued');
    } else if (work.phase === 'candidate') {
      const candidate = Candidate.parse(await ports.candidate(work.remoteId!, work.ordinal));
      if (candidate.baseSha !== incident.baseCommit) throw new Error('candidate_base_mismatch');
      work.candidate = candidate; work.results = []; work.phase = 'evaluate';
      save('queued', () => { store.advance(id, incident.revision, 'evaluating', ctx(),
        [{ type: 'candidate.received', payload: { candidate } }]); });
    } else if (work.phase === 'evaluate') {
      work.results = (await ports.evaluate(work.candidate!)).map(result => GateResult.parse(result));
      const verdict = evaluateAcceptance(work.config.profile, identity(incident, work), work.results);
      if (verdict.decision === 'incomplete' || verdict.decision === 'invalid_evidence') throw new Error(verdict.decision);
      const events = work.results.map(result => ({ type: 'gate.finished' as const, payload: { result } }));
      if (verdict.decision === 'rejected') {
        work.phase = 'feedback';
        save('queued', () => { store.advance(id, incident.revision, 'engineering', ctx(), events); });
      } else { work.phase = 'stop'; save('queued'); }
    } else if (work.phase === 'feedback') {
      if (work.ordinal >= work.config.maxAttempts) { work.ordinal++; save('queued'); return true; }
      const outcome = await ports.feedback(work.remoteId!, work.candidate!, work.results, `feedback:${id}:${work.ordinal}`);
      if (outcome.kind !== 'delivered') throw new Error(`feedback_${outcome.kind}`);
      work.ordinal++; work.phase = 'candidate'; save('queued', () => store.recordEvent(id, 'feedback.sent', { operationId: `feedback:${id}:${work.ordinal - 1}`, candidateSha: work.candidate!.candidateSha, remainingAttempts: work.config.maxAttempts - work.ordinal + 1, executionMode: work.config.mode }));
    } else if (work.phase === 'stop') {
      if (!await ports.stop(work.remoteId!)) throw new Error('termination_unconfirmed');
      work.remoteId = null; work.phase = 'release';
      const currentIdentity = identity(incident, work);
      const acceptance = evaluateAcceptance(work.config.profile, currentIdentity, work.results);
      save('queued', () => { store.advance(id, incident.revision, 'accepted', { ...ctx(), currentIdentity, acceptance },
        work.results.map(result => ({ type: 'gate.finished', payload: { result } }))); });
    } else if (work.phase === 'release') {
      const currentIdentity = identity(incident, work);
      // The publisher must independently check its authority immediately before activation.
      const releasing = store.advance(id, incident.revision, 'releasing', { ...ctx(), currentIdentity });
      const release = ReleaseEnvelope.parse(await ports.release(currentIdentity, work.results));
      if (release.incidentId !== id || release.acceptedSha !== currentIdentity.candidateSha ||
          JSON.stringify([...release.gateResultIds].sort()) !== JSON.stringify(work.results.map(r => r.id).sort())) throw new Error('release_identity_mismatch');
      work.release = release; work.phase = 'complete';
      save('queued', () => { if (store.getIncident(id)!.revision !== releasing.revision) throw new Error('release_state_changed'); });
    } else {
      save('done', () => { store.advance(id, incident.revision, 'completed', { ...ctx(), currentIdentity: identity(incident, work) },
        [{ type: 'release.activated', payload: { release: work.release, executionMode: work.config.mode } }]); });
    }
  } catch (error) {
    work.failure = error instanceof Error ? error.message : 'execution_failed';
    save('held');
  }
  return true;
}
function identity(incident: NonNullable<ReturnType<ControllerStore['getIncident']>>, work: Work): AcceptanceIdentity {
  return { candidateSha: work.candidate!.candidateSha, evaluatorRevision: incident.evaluatorRevision,
    inputHash: incident.inputsHash, acceptanceContractHash: incident.acceptanceContractHash };
}
