// FIXTURE scenarios required by docs/contracts.md ("Required contract fixtures").
// Synthetic data for controller/dashboard development. Never a real Devin run.
import { FX_BASE, fxGitSha, fxProfile, scenarioBuilder, type FixtureScenario, type StatusStep } from './factories';

const TO_EVALUATING: StatusStep[] = [{ to: 'reproducing' }, { to: 'engineering' }, { to: 'evaluating' }];

function successfulRepair(): FixtureScenario {
  const s = scenarioBuilder('successful-repair', 'Successful repair on first candidate');
  s.event('baseline.observed', { gateId: 'A01', reproduced: true }, { actor: 'runner' });
  const a1 = s.attempt(1);
  s.usage(2.5, 'reported');
  const c1 = s.candidate(a1, 'c1');
  const results = s.allPass(c1.candidateSha);
  s.evaluate(c1.candidateSha, results, 'accepted');
  s.release(c1.candidateSha, results.map((r) => r.id));
  return s.finish([...TO_EVALUATING, { to: 'accepted', candidateSha: c1.candidateSha }, { to: 'releasing' }, { to: 'completed' }]);
}

function rejectionThenRepair(): FixtureScenario {
  const s = scenarioBuilder('rejection-then-repair', 'First candidate rejected by A03, corrected candidate accepted');
  s.event('baseline.observed', { gateId: 'A01', reproduced: true }, { actor: 'runner' });
  const a1 = s.attempt(1);
  const c1 = s.candidate(a1, 'c1');
  s.evaluate(
    c1.candidateSha,
    s.allPass(c1.candidateSha, {
      A03: { outcome: 'fail', reason: 'closing_level_mismatch', expected: { closing: 120 }, actual: { closing: -120 } },
    }),
    'rejected',
  );
  const a2 = s.attempt(2, { opKind: 'feedback', remoteSessionId: a1.remoteSessionId });
  const c2 = s.candidate(a2, 'c2');
  const results = s.allPass(c2.candidateSha);
  s.evaluate(c2.candidateSha, results, 'accepted');
  s.release(c2.candidateSha, results.map((r) => r.id));
  return s.finish([
    ...TO_EVALUATING,
    { to: 'engineering' },
    { to: 'evaluating' },
    { to: 'accepted', candidateSha: c2.candidateSha },
    { to: 'releasing' },
    { to: 'completed' },
  ]);
}

function invalidInputRefusal(): FixtureScenario {
  const s = scenarioBuilder('invalid-input-refusal', 'Unsupported request refused by input contract');
  s.event('incident.refused', { reason: 'invalid_input', detail: 'FIXTURE: required binding `value` missing' }, { actor: 'library_adapter' });
  return s.finish([{ to: 'refused' }]);
}

function gateProposalHeld(): FixtureScenario {
  const s = scenarioBuilder('gate-proposal-held', 'Weak-gate proposal held for separate evaluation', { kind: 'gate_strengthening' });
  const a1 = s.attempt(1);
  const c1 = s.candidate(a1, 'validator-proposal');
  const proposal = s.artifact('proposal', 'gate_proposal');
  // Proposed gate results cannot authorize the current run: not in the frozen profile.
  s.evaluate(
    c1.candidateSha,
    [s.result(c1.candidateSha, 'A04-overflow-proposed', 'pass', { evaluatorRevision: fxGitSha('evaluator-v2-proposed') })],
    'invalid_evidence',
  );
  s.decision('adopt-gate', 'gate_adoption', 'pending', 'Separate A06 evaluation: known-bad rejection and known-good acceptance', [proposal.id]);
  s.blocked('evaluating', 'gate_adoption_pending');
  return s.finish([...TO_EVALUATING, { to: 'blocked', blockReason: 'gate_adoption_pending' }]);
}

function capabilityGrowth(): FixtureScenario {
  const profile = fxProfile('FIXTURE-sample-growth-v1', {
    A05: { gateId: 'A05', gateVersion: 1, requirement: 'required', notApplicableAllowed: true },
  });
  const s = scenarioBuilder('capability-growth', 'Bounded new capability: reconciliation-residual diagnostic', { kind: 'capability', profile });
  const a1 = s.attempt(1);
  const c1 = s.candidate(a1, 'residual-diagnostic');
  const results = s.allPass(c1.candidateSha, { A05: { outcome: 'not_applicable', reason: 'no_prior_family_consumers' } });
  s.evaluate(c1.candidateSha, results, 'accepted');
  s.release(c1.candidateSha, results.map((r) => r.id));
  return s.finish([...TO_EVALUATING, { to: 'accepted', candidateSha: c1.candidateSha }, { to: 'releasing' }, { to: 'completed' }]);
}

function ambiguousProviderCreation(): FixtureScenario {
  const s = scenarioBuilder('ambiguous-provider-creation', 'Create timed out after send; reconciliation ambiguous');
  s.attempt(1, { opStatus: 'unknown_outcome', reconciliation: 'ambiguous', remoteSessionId: null, status: 'unknown' });
  s.blocked('engineering', 'provider_creation_ambiguous');
  s.decision('reconcile', 'block_resolution', 'pending', 'Operator must confirm whether a remote session exists before any redispatch');
  return s.finish([{ to: 'reproducing' }, { to: 'engineering' }, { to: 'blocked', blockReason: 'provider_creation_ambiguous' }]);
}

function pendingCancellation(): FixtureScenario {
  const s = scenarioBuilder('pending-cancellation', 'Cancellation requested; remote stop not yet confirmed');
  const a1 = s.attempt(1);
  s.event('cancel.requested', {}, { actor: 'human:FIXTURE-operator' });
  s.op('cancel-1', 'cancel', 'sent', a1.id, a1.remoteSessionId);
  s.event('session.observed', { remoteSessionId: a1.remoteSessionId, state: 'running', providerTime: null }, { attemptId: a1.id, actor: 'harness_adapter' });
  return s.finish(
    [{ to: 'reproducing' }, { to: 'engineering' }, { to: 'cancel_pending', requestCancellation: true, activeRemoteSessions: 1 }],
    { cancellationRequested: true },
  );
}

function staleCandidate(): FixtureScenario {
  const s = scenarioBuilder('stale-candidate', 'Accepted candidate is stale after integration head moved');
  const a1 = s.attempt(1);
  const c1 = s.candidate(a1, 'c1', FX_BASE);
  const results = s.allPass(c1.candidateSha);
  s.evaluate(c1.candidateSha, results, 'accepted');
  s.event('release.started', { acceptedSha: c1.candidateSha });
  s.blocked('releasing', 'stale_base');
  // Integrating onto the new head yields new bytes; reusing c1's evidence must not authorize it.
  s.evaluate(fxGitSha('stale-candidate:c1-integrated'), results, 'invalid_evidence', false);
  return s.finish([
    ...TO_EVALUATING,
    { to: 'accepted', candidateSha: c1.candidateSha },
    { to: 'releasing' },
    { to: 'blocked', blockReason: 'stale_base' },
  ]);
}

function missingGateEvidence(): FixtureScenario {
  const s = scenarioBuilder('missing-gate-evidence', 'Required gate evidence missing or errored; held, not rejected');
  const a1 = s.attempt(1);
  const c1 = s.candidate(a1, 'c1');
  const results = s
    .allPass(c1.candidateSha, {
      A05: { outcome: 'error', reason: 'infrastructure_error' },
      A07: { outcome: 'not_run', reason: 'runner_unavailable' },
    })
    .filter((r) => r.gateId !== 'A04');
  s.evaluate(c1.candidateSha, results, 'incomplete');
  s.blocked('evaluating', 'missing_gate_evidence');
  return s.finish([...TO_EVALUATING, { to: 'blocked', blockReason: 'missing_gate_evidence' }]);
}

function unknownUsage(): FixtureScenario {
  const s = scenarioBuilder('unknown-usage', 'Provider usage unknown/lagging while session runs');
  const a1 = s.attempt(1);
  s.usage(null, 'unknown');
  s.event('session.observed', { remoteSessionId: a1.remoteSessionId, state: 'running', providerTime: null }, { attemptId: a1.id, actor: 'harness_adapter' });
  s.usage(null, 'unknown', 'provider_dashboard');
  return s.finish([{ to: 'reproducing' }, { to: 'engineering' }]);
}

export const FIXTURE_SCENARIOS: readonly FixtureScenario[] = [
  successfulRepair(),
  rejectionThenRepair(),
  invalidInputRefusal(),
  gateProposalHeld(),
  capabilityGrowth(),
  ambiguousProviderCreation(),
  pendingCancellation(),
  staleCandidate(),
  missingGateEvidence(),
  unknownUsage(),
];

export const fixtureScenario = (key: string): FixtureScenario => {
  const found = FIXTURE_SCENARIOS.find((s) => s.key === key);
  if (!found) throw new Error(`unknown FIXTURE scenario ${key}`);
  return found;
};
