import { evaluateAcceptance } from '../contracts/gates';
import type { ControllerStore } from './store';

/** Full persisted evaluation projection; never reconstructed from the last 100 events. */
export function evaluationSnapshots(store: ControllerStore) {
  return Object.fromEntries(store.jobSnapshots().flatMap(job => {
    const incident = store.getIncident(job.incidentId);
    if (!incident || !job.config?.profile) return [];
    const identity = job.candidate ? { candidateSha: job.candidate.candidateSha,
      evaluatorRevision: incident.evaluatorRevision, inputHash: incident.inputsHash,
      acceptanceContractHash: incident.acceptanceContractHash } : null;
    const verdict = evaluateAcceptance(job.config.profile, identity, job.results ?? []);
    const stages = job.config.profile.gates.map((gate: {gateId: string; gateVersion: number}) => {
      const results = (job.results ?? []).filter((r: {gateId: string}) => r.gateId === gate.gateId);
      const errors = verdict.issues.filter(issue => issue.blocking && (issue.gateId === gate.gateId || issue.gateId === null));
      const outcome = !identity ? 'not_run' : errors.some(issue => !['gate_failed','missing_required_result'].includes(issue.code)) ? 'error'
        : errors.some(issue => issue.code === 'gate_failed') ? 'fail'
        : results.length === 1 && results[0].outcome === 'pass' ? 'pass' : 'not_run';
      return { id: gate.gateId, label: gate.gateId, outcome };
    });
    return [[job.incidentId, { executionMode: job.config.mode, candidateId: identity?.candidateSha ?? null,
      attempt: job.candidate ? job.ordinal : 0, stages, stageIndex: stages.findIndex((s: {outcome:string}) => s.outcome !== 'pass'),
      status: verdict.accepted ? 'completed' : verdict.decision === 'rejected' ? 'failed' : incident.status === 'evaluating' ? 'running' : 'idle',
      decision: verdict.decision, issues: verdict.issues, jobState: job.state }]];
  }));
}
