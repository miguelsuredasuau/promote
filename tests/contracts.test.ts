import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as browserContracts from '../contracts/browser';
import {
  BudgetObservation,
  BudgetReservation,
  Candidate,
  EVENT_TYPES,
  EngineeringTask,
  GateProfile,
  GateResult,
  INCIDENT_STATUSES,
  INCIDENT_TRANSITIONS,
  Incident,
  TERMINAL_STATUSES,
  WorkshopEvent,
  canonicalJson,
  evaluateAcceptance,
  foldEvents,
  hashCanonical,
  hashGateProfile,
  isTrustedVerdict,
  mayRedispatch,
  requestCancellation,
  resolveBlock,
  sha256Hex,
  transitionIncident,
  type AcceptanceIdentity,
  type AcceptanceVerdict,
  type IncidentMachineState,
  type IncidentStatus,
  type TransitionContext,
} from '../contracts';
import {
  FIXTURE_SCENARIOS,
  FixtureScenario,
  fixtureScenario,
  fxGitSha,
  fxSha256,
  fxTime,
  identityFor,
  replayStatusPath,
} from '../fixtures/contracts';

const NOW = fxTime(0);
const ctx = (over: Partial<TransitionContext> = {}): TransitionContext => ({
  now: NOW,
  activeRemoteSessions: 0,
  activeLocalProcesses: 0,
  ...over,
});
const st = (status: IncidentStatus, over: Partial<IncidentMachineState> = {}): IncidentMachineState => ({
  status,
  block: null,
  cancelRequested: false,
  acceptedIdentity: null,
  ...over,
});
const clone = <T>(v: T): T => structuredClone(v);

// Baseline evidence: the successful-repair fixture's single accepted evaluation.
const base = fixtureScenario('successful-repair');
const baseEval = base.evaluations[0];
const baseIdentity = identityFor(base, baseEval.candidateSha);
const accept = (results: unknown[], profile: unknown = base.gateProfile, identity: unknown = baseIdentity) =>
  evaluateAcceptance(profile, identity, results);
const codes = (v: AcceptanceVerdict) => v.issues.filter((i) => i.blocking).map((i) => i.code);
const withGate = (gateId: string, patch: Partial<GateResult>) =>
  baseEval.results.map((r) => (r.gateId === gateId ? { ...r, ...patch } : r));
const ACCEPTED_VERDICT = accept(baseEval.results);
// Candidate B: same frozen contract, different commit.
const identityB: AcceptanceIdentity = { ...baseIdentity, candidateSha: fxGitSha('candidate-B') };
/** State after a legal evaluating -> accepted for `baseIdentity`. */
const acceptedA = (): IncidentMachineState => {
  const r = transitionIncident(st('evaluating'), 'accepted', ctx({ acceptance: ACCEPTED_VERDICT, currentIdentity: baseIdentity }));
  if (!r.ok) throw new Error(r.message);
  return r.state;
};

describe('hashing and canonical JSON', () => {
  it('sha256Hex (node:crypto) matches the standard test vector; canonical hashing is order independent', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashCanonical({ b: 1, a: 2 })).toBe(hashCanonical({ a: 2, b: 1 }));
    expect(hashCanonical({ b: 1, a: 2 })).toBe(sha256Hex('{"a":2,"b":1}'));
  });

  it('canonical JSON is key-order independent and rejects non-JSON values', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: null }] })).toBe(canonicalJson({ a: [2, { c: null, d: 1 }], b: 1 }));
    expect(canonicalJson({ z: undefined, a: 'é' })).toBe('{"a":"é"}');
    expect(() => canonicalJson({ a: Number.NaN })).toThrow();
    expect(() => canonicalJson({ a: Number.POSITIVE_INFINITY })).toThrow();
    expect(() => canonicalJson(undefined)).toThrow();
  });
});

describe('browser barrel', () => {
  const contractsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../contracts');
  const SERVER_ONLY = ['hash.ts', 'gates.ts', 'state.ts', 'index.ts'];

  it('does not export authoritative hashing, evaluation or transition functions', () => {
    for (const name of ['sha256Hex', 'hashCanonical', 'hashGateProfile', 'evaluateAcceptance', 'isTrustedVerdict', 'transitionIncident', 'resolveBlock', 'requestCancellation']) {
      expect(name in browserContracts, name).toBe(false);
    }
    expect('WorkshopEvent' in browserContracts && 'GateProfile' in browserContracts && 'canonicalJson' in browserContracts).toBe(true);
  });

  it('module graph reachable from browser.ts has no node: imports or server-only modules', () => {
    const seen = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const src = readFileSync(resolve(contractsDir, file), 'utf8');
      for (const [, spec] of src.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)) {
        expect(spec.startsWith('node:'), `${file} imports ${spec}`).toBe(false);
        if (spec.startsWith('./')) visit(`${spec.slice(2)}.ts`);
      }
    };
    visit('browser.ts');
    for (const f of SERVER_ONLY) expect(seen.has(f), `browser graph reaches ${f}`).toBe(false);
    expect(seen.size).toBeGreaterThan(5);
  });
});

describe('record validation (CONTRACT-01)', () => {
  const candidate = base.candidates[0];
  const gateResult = baseEval.results[0];

  it('rejects a candidate without a full candidate SHA', () => {
    const { candidateSha: _omit, ...missing } = candidate;
    expect(Candidate.safeParse(missing).success).toBe(false);
    expect(Candidate.safeParse({ ...candidate, candidateSha: candidate.candidateSha.slice(0, 12) }).success).toBe(false);
    expect(Candidate.safeParse({ ...candidate, candidateSha: candidate.baseSha }).success).toBe(false);
    expect(Candidate.safeParse(candidate).success).toBe(true);
  });

  it('rejects unknown verdicts, pass without evidence, wrong schema version and unknown fields', () => {
    expect(GateResult.safeParse({ ...gateResult, outcome: 'passed' }).success).toBe(false);
    expect(GateResult.safeParse({ ...gateResult, outcome: 'skipped' }).success).toBe(false);
    expect(GateResult.safeParse({ ...gateResult, logArtifactId: null }).success).toBe(false);
    expect(GateResult.safeParse({ ...gateResult, schemaVersion: 2 }).success).toBe(false);
    expect(GateResult.safeParse({ ...gateResult, trustedBecause: 'agent said so' }).success).toBe(false);
    expect(GateResult.safeParse({ ...gateResult, outcome: 'fail', logArtifactId: null }).success).toBe(true);
  });

  it('rejects non-UTC timestamps, unsafe paths and path-like IDs', () => {
    expect(GateResult.safeParse({ ...gateResult, startedAt: '2026-09-19T08:00:00+02:00' }).success).toBe(false);
    expect(Candidate.safeParse({ ...candidate, changedPaths: { computedBy: 'controller', paths: ['../etc/passwd'] } }).success).toBe(false);
    expect(Candidate.safeParse({ ...candidate, changedPaths: { computedBy: 'agent', paths: [] } }).success).toBe(false);
    expect(Incident.safeParse({ ...base.incident, id: '/tmp/x' }).success).toBe(false);
  });

  it('ties incident block/cancellation records to status', () => {
    expect(Incident.safeParse({ ...base.incident, status: 'blocked' }).success).toBe(false);
    expect(Incident.safeParse({ ...base.incident, status: 'cancel_pending' }).success).toBe(false);
  });

  it('keeps unknown usage null and never coerces it to zero', () => {
    const obs = { schemaVersion: 1, provider: 'devin', amount: null, unit: 'acu', observedAt: NOW, source: 'provider_api', reliability: 'unknown' };
    const parsed = BudgetObservation.parse(obs);
    expect(parsed.amount).toBeNull();
    expect(BudgetObservation.safeParse({ ...obs, amount: 0 }).success).toBe(false);
    expect(BudgetObservation.safeParse({ ...obs, reliability: 'reported' }).success).toBe(false);
    expect(BudgetObservation.safeParse({ ...obs, amount: undefined }).success).toBe(false);
    expect(BudgetObservation.safeParse({ ...obs, amount: 0, reliability: 'reported' }).success).toBe(true);
  });

  it('rejects non-finite budget amounts', () => {
    const obs = { schemaVersion: 1, provider: 'devin', amount: 1, unit: 'acu', observedAt: NOW, source: 'provider_api', reliability: 'reported' };
    for (const amount of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1]) {
      expect(BudgetObservation.safeParse({ ...obs, amount }).success, String(amount)).toBe(false);
      expect(BudgetObservation.safeParse({ ...obs, amount, reliability: 'estimated' }).success, String(amount)).toBe(false);
      expect(BudgetReservation.safeParse({ reservationId: 'FIXTURE-res', unit: 'acu', maxAmount: amount }).success, String(amount)).toBe(false);
    }
    expect(BudgetReservation.safeParse({ reservationId: 'FIXTURE-res', unit: 'acu', maxAmount: 10 }).success).toBe(true);
  });

  it('refuses credentials in engineering tasks', () => {
    const task = {
      incidentId: 'FIXTURE-inc',
      repo: 'owner/name',
      baseSha: fxGitSha('base'),
      reproductionArtifactIds: [],
      contractSummary: 'x',
      allowedPaths: ['core/data/bridge.ts'],
      protectedPaths: ['tests/'],
      resultSchemaId: 'result-v1',
      deadline: NOW,
      providerExtension: { maxAcu: 5 },
    };
    expect(EngineeringTask.safeParse(task).success).toBe(true);
    expect(EngineeringTask.safeParse({ ...task, providerExtension: { apiKey: 'x' } }).success).toBe(false);
  });

  it('only authoritative non-creation permits redispatch', () => {
    const op = fixtureScenario('ambiguous-provider-creation').providerOperations[0];
    expect(op.status).toBe('unknown_outcome');
    expect(mayRedispatch(op)).toBe(false);
    expect(mayRedispatch({ ...op, reconciliation: 'unsupported' })).toBe(false);
    expect(mayRedispatch({ ...op, reconciliation: null })).toBe(false);
    expect(mayRedispatch({ ...op, reconciliation: 'not_found_confirmed' })).toBe(true);
    expect(mayRedispatch({ ...op, status: 'sent', reconciliation: 'not_found_confirmed' })).toBe(false);
  });
});

describe('events', () => {
  it('matches the canonical event vocabulary exactly', () => {
    expect([...EVENT_TYPES]).toEqual([
      'incident.received', 'incident.transitioned', 'baseline.observed', 'dispatch.pending', 'session.created', 'session.observed',
      'candidate.received', 'gate.started', 'gate.finished', 'feedback.sent', 'decision.pending',
      'decision.recorded', 'release.started', 'release.activated', 'artifact.created', 'budget.observed',
      'incident.blocked', 'incident.refused', 'incident.completed', 'control.paused', 'control.resumed',
      'cancel.requested', 'cancel.confirmed',
    ]);
  });

  const ev = base.events[0];
  it('rejects unknown types, bad envelopes and malformed typed payloads', () => {
    expect(WorkshopEvent.safeParse(ev).success).toBe(true);
    expect(WorkshopEvent.safeParse({ ...ev, type: 'incident.started' }).success).toBe(false);
    expect(WorkshopEvent.safeParse({ ...ev, sequence: 0 }).success).toBe(false);
    expect(WorkshopEvent.safeParse({ ...ev, actor: 'unqualified-actor' }).success).toBe(false);
    expect(WorkshopEvent.safeParse({ ...ev, actor: 'human:operator-1' }).success).toBe(true);
    expect(WorkshopEvent.safeParse({ ...ev, type: 'gate.finished', payload: { result: { outcome: 'pass' } } }).success).toBe(false);
    const usage = { schemaVersion: 1, provider: 'devin', amount: 0, unit: 'acu', observedAt: NOW, source: 'provider_api', reliability: 'unknown' };
    expect(WorkshopEvent.safeParse({ ...ev, type: 'budget.observed', payload: { observation: usage } }).success).toBe(false);
    expect(WorkshopEvent.safeParse({ ...ev, type: 'incident.blocked', payload: { fromStatus: 'evaluating', reason: 'Some Reason' } }).success).toBe(false);
  });

  it('folds events once each in sequence order (at-least-once delivery)', () => {
    const count = (n: number) => n + 1;
    const events = base.events;
    const once = foldEvents(count, { state: 0, lastSequence: 0 }, events);
    const again = foldEvents(count, once, [...events].reverse());
    expect(once.state).toBe(events.length);
    expect(again).toEqual(once);
  });
});

describe('incident state machine (CONTRACT-02)', () => {
  it('rejects every transition outside the canonical table', () => {
    for (const from of INCIDENT_STATUSES) {
      if (TERMINAL_STATUSES.includes(from)) continue;
      for (const to of INCIDENT_STATUSES) {
        if (INCIDENT_TRANSITIONS[from].includes(to)) continue;
        const r = transitionIncident(st(from, { cancelRequested: true }), to, ctx({ acceptance: ACCEPTED_VERDICT, blockReason: 'x' }));
        expect(r.ok, `${from} -> ${to}`).toBe(false);
        if (!r.ok) expect(r.error).toBe('illegal_transition');
      }
    }
    const r = transitionIncident(st('received'), 'engineering', ctx());
    expect(r).toMatchObject({ ok: false, error: 'illegal_transition' });
  });

  it('never resurrects terminal states', () => {
    for (const from of TERMINAL_STATUSES) {
      for (const to of INCIDENT_STATUSES) {
        const r = transitionIncident(st(from, { cancelRequested: true }), to, ctx({ acceptance: ACCEPTED_VERDICT, blockReason: 'x' }));
        expect(r).toMatchObject({ ok: false, error: 'terminal_state' });
      }
    }
  });

  it('binds blocked resumption to the recorded prior phase and a recorded resolution', () => {
    const blocked = transitionIncident(st('engineering'), 'blocked', ctx({ blockReason: 'provider_creation_ambiguous' }));
    expect(blocked.ok).toBe(true);
    if (!blocked.ok) return;
    expect(blocked.state.block).toMatchObject({ fromStatus: 'engineering', reason: 'provider_creation_ambiguous', resolution: null });

    expect(transitionIncident(blocked.state, 'evaluating', ctx())).toMatchObject({ ok: false, error: 'blocked_resume_mismatch' });
    expect(transitionIncident(blocked.state, 'releasing', ctx())).toMatchObject({ ok: false, error: 'blocked_resume_mismatch' });
    expect(transitionIncident(blocked.state, 'completed', ctx())).toMatchObject({ ok: false, error: 'illegal_transition' });
    expect(transitionIncident(blocked.state, 'engineering', ctx())).toMatchObject({ ok: false, error: 'block_unresolved' });
    // A blocked state without a recorded phase cannot resume anywhere.
    expect(transitionIncident(st('blocked'), 'engineering', ctx())).toMatchObject({ ok: false, error: 'blocked_resume_mismatch' });

    const resolved = resolveBlock(blocked.state, 'FIXTURE-dec-1', NOW);
    const resumed = transitionIncident(resolved, 'engineering', ctx());
    expect(resumed).toMatchObject({ ok: true, state: { status: 'engineering', block: null } });

    // Once cancellation is requested, a resolved block still cannot resume work.
    const cancelled = requestCancellation(resolved);
    expect(transitionIncident(cancelled, 'engineering', ctx())).toMatchObject({ ok: false, error: 'cancellation_requested' });
    expect(transitionIncident(cancelled, 'cancel_pending', ctx({ activeRemoteSessions: 1 })).ok).toBe(true);
  });

  it('requires a reason to block and a passing verdict to accept', () => {
    expect(transitionIncident(st('evaluating'), 'blocked', ctx())).toMatchObject({ ok: false, error: 'block_reason_missing' });
    expect(transitionIncident(st('evaluating'), 'accepted', ctx())).toMatchObject({ ok: false, error: 'acceptance_not_established' });
    const rejected = accept(withGate('A03', { outcome: 'fail', reason: 'closing_level_mismatch' }));
    expect(transitionIncident(st('evaluating'), 'accepted', ctx({ acceptance: rejected, currentIdentity: baseIdentity }))).toMatchObject({
      ok: false,
      error: 'acceptance_not_established',
    });
    expect(transitionIncident(st('evaluating'), 'accepted', ctx({ acceptance: ACCEPTED_VERDICT, currentIdentity: baseIdentity })).ok).toBe(true);
  });

  it('models cancellation safely', () => {
    expect(transitionIncident(st('engineering'), 'cancel_pending', ctx())).toMatchObject({ ok: false, error: 'cancellation_intent_missing' });
    expect(transitionIncident(st('engineering'), 'cancelled', ctx())).toMatchObject({ ok: false, error: 'illegal_transition' });

    const pending = transitionIncident(requestCancellation(st('engineering')), 'cancel_pending', ctx({ activeRemoteSessions: 1 }));
    expect(pending.ok).toBe(true);
    if (!pending.ok) return;
    expect(transitionIncident(pending.state, 'cancelled', ctx({ activeRemoteSessions: 1 }))).toMatchObject({ ok: false, error: 'active_remote_session' });
    expect(transitionIncident(pending.state, 'cancelled', ctx({ activeRemoteSessions: 'unknown' }))).toMatchObject({ ok: false, error: 'active_remote_session' });
    // Late completion after cancellation cannot re-enter evaluation or publish.
    expect(transitionIncident(pending.state, 'evaluating', ctx())).toMatchObject({ ok: false, error: 'illegal_transition' });
    expect(transitionIncident(pending.state, 'cancelled', ctx()).ok).toBe(true);

    for (const phase of ['accepted', 'releasing'] as const) {
      const r = transitionIncident(requestCancellation(st(phase === 'accepted' ? 'evaluating' : 'accepted')), phase, ctx({ acceptance: ACCEPTED_VERDICT }));
      expect(r).toMatchObject({ ok: false, error: 'cancellation_requested' });
    }
    expect(transitionIncident(requestCancellation(st('releasing')), 'completed', ctx())).toMatchObject({ ok: false, error: 'cancellation_requested' });
  });

  it('does not cancel from evaluating with a live session; routes via blocked -> cancel_pending', () => {
    const evaluating = requestCancellation(st('evaluating'));
    expect(transitionIncident(evaluating, 'cancelled', ctx({ activeRemoteSessions: 1 }))).toMatchObject({ ok: false, error: 'active_remote_session' });
    expect(transitionIncident(evaluating, 'cancel_pending', ctx({ activeRemoteSessions: 1 }))).toMatchObject({ ok: false, error: 'illegal_transition' });
    const blocked = transitionIncident(evaluating, 'blocked', ctx({ blockReason: 'cancel_with_active_session', activeRemoteSessions: 1 }));
    if (!blocked.ok) throw new Error(blocked.message);
    const pending = transitionIncident(blocked.state, 'cancel_pending', ctx({ activeRemoteSessions: 1 }));
    if (!pending.ok) throw new Error(pending.message);
    expect(transitionIncident(pending.state, 'cancelled', ctx()).ok).toBe(true);
  });

  it('enters no terminal state unless remote sessions AND local processes are confirmed stopped', () => {
    const releasing = { ...acceptedA(), status: 'releasing' as const };
    const cases = [
      [st('evaluating'), 'refused'],
      [st('engineering'), 'budget_exhausted'],
      [releasing, 'completed'],
      [requestCancellation(st('cancel_pending')), 'cancelled'],
    ] as const;
    for (const [state, to] of cases) {
      const c = (over: Partial<TransitionContext>) => ctx({ currentIdentity: baseIdentity, ...over });
      expect(transitionIncident(state, to, c({ activeRemoteSessions: 'unknown' })), `${to} remote unknown`).toMatchObject({ ok: false, error: 'active_remote_session' });
      // Remote stopped, local still running / unknown.
      expect(transitionIncident(state, to, c({ activeLocalProcesses: 1 })), `${to} local running`).toMatchObject({ ok: false, error: 'active_local_process' });
      expect(transitionIncident(state, to, c({ activeLocalProcesses: 'unknown' })), `${to} local unknown`).toMatchObject({ ok: false, error: 'active_local_process' });
      expect(transitionIncident(state, to, c({ activeRemoteSessions: 1, activeLocalProcesses: 1 })).ok).toBe(false);
      // Both confirmed stopped.
      expect(transitionIncident(state, to, c({})).ok, `${to} both stopped`).toBe(true);
    }
  });

  it('ignores late completion after sticky cancellation', () => {
    let s = requestCancellation(acceptedA());
    s = requestCancellation(s); // idempotent, still sticky
    expect(s.cancelRequested).toBe(true);
    const c = ctx({ currentIdentity: baseIdentity, acceptance: ACCEPTED_VERDICT });
    expect(transitionIncident(s, 'releasing', c)).toMatchObject({ ok: false, error: 'cancellation_requested' });
    // A late candidate/finished session cannot restart work either.
    const pending = requestCancellation(st('cancel_pending'));
    for (const to of ['evaluating', 'accepted', 'releasing', 'completed'] as const) {
      expect(transitionIncident(pending, to, c).ok, to).toBe(false);
    }
    // Blocking and resolving does not clear cancellation.
    const blocked = transitionIncident(pending, 'blocked', ctx({ blockReason: 'remote_stop_unconfirmed' }));
    if (!blocked.ok) throw new Error(blocked.message);
    const resolved = resolveBlock(blocked.state, 'FIXTURE-dec-2', NOW);
    expect(resolved.cancelRequested).toBe(true);
    expect(transitionIncident(resolved, 'engineering', c).ok).toBe(false);
    expect(transitionIncident(resolved, 'cancelled', ctx({ activeLocalProcesses: 'unknown' }))).toMatchObject({ ok: false, error: 'active_local_process' });
    expect(transitionIncident(resolved, 'cancelled', ctx()).ok).toBe(true);
  });
});

describe('acceptance identity binding', () => {
  it('a verdict for candidate A cannot accept candidate B', () => {
    const r = transitionIncident(st('evaluating'), 'accepted', ctx({ acceptance: ACCEPTED_VERDICT, currentIdentity: identityB }));
    expect(r).toMatchObject({ ok: false, error: 'acceptance_identity_mismatch' });
    expect(transitionIncident(st('evaluating'), 'accepted', ctx({ acceptance: ACCEPTED_VERDICT }))).toMatchObject({ ok: false, error: 'acceptance_identity_mismatch' });
    expect(acceptedA().acceptedIdentity).toEqual(baseIdentity);
  });

  it('changed input, evaluator or profile cannot reuse an acceptance', () => {
    const changed: AcceptanceIdentity[] = [
      { ...baseIdentity, inputHash: fxSha256('other-inputs') },
      { ...baseIdentity, evaluatorRevision: fxGitSha('evaluator-v2') },
      { ...baseIdentity, acceptanceContractHash: fxSha256('other-profile') },
    ];
    for (const current of changed) {
      expect(transitionIncident(st('evaluating'), 'accepted', ctx({ acceptance: ACCEPTED_VERDICT, currentIdentity: current }))).toMatchObject({
        ok: false,
        error: 'acceptance_identity_mismatch',
      });
      expect(transitionIncident(acceptedA(), 'releasing', ctx({ currentIdentity: current }))).toMatchObject({ ok: false, error: 'acceptance_identity_mismatch' });
    }
  });

  it('accepted A cannot release or complete B; releasing/completed require the bound identity', () => {
    const a = acceptedA();
    expect(transitionIncident(a, 'releasing', ctx({ currentIdentity: identityB }))).toMatchObject({ ok: false, error: 'acceptance_identity_mismatch' });
    expect(transitionIncident(a, 'releasing', ctx())).toMatchObject({ ok: false, error: 'acceptance_identity_mismatch' });
    const releasing = transitionIncident(a, 'releasing', ctx({ currentIdentity: baseIdentity }));
    if (!releasing.ok) throw new Error(releasing.message);
    expect(releasing.state.acceptedIdentity).toEqual(baseIdentity);
    expect(transitionIncident(releasing.state, 'completed', ctx({ currentIdentity: identityB }))).toMatchObject({ ok: false, error: 'acceptance_identity_mismatch' });
    expect(transitionIncident(releasing.state, 'completed', ctx({ currentIdentity: baseIdentity })).ok).toBe(true);
    // Without a recorded acceptance at all.
    expect(transitionIncident(st('accepted'), 'releasing', ctx({ currentIdentity: baseIdentity }))).toMatchObject({ ok: false, error: 'accepted_identity_missing' });
    expect(transitionIncident(st('releasing'), 'completed', ctx({ currentIdentity: baseIdentity }))).toMatchObject({ ok: false, error: 'accepted_identity_missing' });
  });

  it('a stale block keeps the old identity and refuses resuming with new bytes', () => {
    const releasing = transitionIncident(acceptedA(), 'releasing', ctx({ currentIdentity: baseIdentity }));
    if (!releasing.ok) throw new Error(releasing.message);
    const blocked = transitionIncident(releasing.state, 'blocked', ctx({ blockReason: 'stale_base' }));
    if (!blocked.ok) throw new Error(blocked.message);
    expect(blocked.state.acceptedIdentity).toEqual(baseIdentity);
    const resolved = resolveBlock(blocked.state, 'FIXTURE-dec-3', NOW);
    expect(transitionIncident(resolved, 'releasing', ctx({ currentIdentity: identityB }))).toMatchObject({ ok: false, error: 'acceptance_identity_mismatch' });
    // Going back to engineering drops the old acceptance.
    const eng = transitionIncident(st('evaluating', { acceptedIdentity: baseIdentity }), 'engineering', ctx());
    expect(eng).toMatchObject({ ok: true, state: { acceptedIdentity: null } });
  });

  it('only verdicts minted by evaluateAcceptance are authority, and they are frozen', () => {
    const forged = structuredClone(ACCEPTED_VERDICT) as AcceptanceVerdict;
    expect(isTrustedVerdict(ACCEPTED_VERDICT)).toBe(true);
    expect(isTrustedVerdict(forged)).toBe(false);
    expect(transitionIncident(st('evaluating'), 'accepted', ctx({ acceptance: forged, currentIdentity: baseIdentity }))).toMatchObject({
      ok: false,
      error: 'untrusted_acceptance',
    });
    const rejected = accept(withGate('A03', { outcome: 'fail', reason: 'x' }));
    expect(() => {
      (rejected as { decision: string }).decision = 'accepted';
    }).toThrow(TypeError);
    expect(() => {
      (ACCEPTED_VERDICT.identity as { candidateSha: string }).candidateSha = identityB.candidateSha;
    }).toThrow(TypeError);
  });

  it('incident records carry an accepted identity bound to their frozen contract', () => {
    const completed = base.incident;
    expect(completed.acceptedIdentity).toEqual(baseIdentity);
    expect(Incident.safeParse({ ...completed, acceptedIdentity: null }).success).toBe(false);
    expect(Incident.safeParse({ ...completed, acceptedIdentity: { ...baseIdentity, inputHash: fxSha256('x') } }).success).toBe(false);
  });
});

describe('gate-profile acceptance', () => {
  it('accepts only complete, bound, passing evidence', () => {
    expect(ACCEPTED_VERDICT).toMatchObject({ decision: 'accepted', accepted: true, issues: [] });
    expect(ACCEPTED_VERDICT.passedRequiredGateIds).toEqual(['A00', 'A02', 'A03', 'A04', 'A05']);
  });

  it('fails closed on an empty required-gate profile (CONTRACT-02)', () => {
    const allSupporting = { ...base.gateProfile, gates: base.gateProfile.gates.map((g) => ({ ...g, requirement: 'supporting' as const })) };
    expect(GateProfile.safeParse(allSupporting).success).toBe(false);
    for (const profile of [allSupporting, { ...base.gateProfile, gates: [] }, {}, null]) {
      const identity = profile && 'gates' in profile ? { ...baseIdentity, acceptanceContractHash: hashGateProfile(profile as GateProfile) } : baseIdentity;
      const v = accept(baseEval.results, profile, identity);
      expect(v.accepted).toBe(false);
      expect(v.decision).toBe('invalid_evidence');
      expect(codes(v)).toContain('empty_required_gates');
    }
  });

  it('holds on missing, errored and not-run required gates', () => {
    const missing = accept(baseEval.results.filter((r) => r.gateId !== 'A03'));
    expect(missing).toMatchObject({ decision: 'incomplete', accepted: false });
    expect(codes(missing)).toEqual(['missing_required_result']);
    expect(accept([])).toMatchObject({ decision: 'incomplete', accepted: false });
    expect(codes(accept(withGate('A04', { outcome: 'error', reason: 'infrastructure_error' })))).toEqual(['gate_error']);
    expect(codes(accept(withGate('A04', { outcome: 'not_run', reason: 'runner_unavailable', logArtifactId: null, durationMs: null })))).toEqual(['gate_not_run']);
  });

  it('rejects on a required failure but not on a supporting one', () => {
    const failed = accept(withGate('A03', { outcome: 'fail', reason: 'closing_level_mismatch' }));
    expect(failed).toMatchObject({ decision: 'rejected', accepted: false, passedRequiredGateIds: [] });
    const supporting = accept(withGate('A07', { outcome: 'fail', reason: 'typecheck_failed' }));
    expect(supporting.accepted).toBe(true);
    expect(supporting.issues).toMatchObject([{ code: 'supporting_gate_not_passed', blocking: false }]);
  });

  it('allows not_applicable only when the frozen profile excludes the gate', () => {
    const na = withGate('A05', { outcome: 'not_applicable', reason: 'no_prior_family_consumers' });
    expect(accept(na)).toMatchObject({ decision: 'incomplete' });
    expect(codes(accept(na))).toEqual(['not_applicable_disallowed']);
    // Loosening the profile after freezing changes its hash: still refused.
    const loosened = { ...base.gateProfile, gates: base.gateProfile.gates.map((g) => (g.gateId === 'A05' ? { ...g, notApplicableAllowed: true } : g)) };
    expect(codes(accept(na, loosened))).toContain('profile_hash_mismatch');
    expect(accept(na, loosened, { ...baseIdentity, acceptanceContractHash: hashGateProfile(loosened) }).accepted).toBe(true);
  });

  it('refuses evidence bound to another candidate, evaluator or input', () => {
    const cases = [
      ['candidate_mismatch', { candidateSha: fxGitSha('other-candidate') }],
      ['evaluator_mismatch', { evaluatorRevision: fxGitSha('other-evaluator') }],
      ['input_mismatch', { inputHash: fxSha256('other-inputs') }],
      ['gate_version_mismatch', { gateVersion: 2 }],
    ] as const;
    for (const [code, patch] of cases) {
      const v = accept(withGate('A03', patch));
      expect(v, code).toMatchObject({ decision: 'invalid_evidence', accepted: false });
      expect(codes(v)).toEqual([code]);
    }
    // Identity itself must match the frozen profile.
    expect(codes(accept(baseEval.results, base.gateProfile, { ...baseIdentity, evaluatorRevision: fxGitSha('x') }))).toContain('profile_evaluator_mismatch');
    expect(accept(baseEval.results, base.gateProfile, { ...baseIdentity, candidateSha: 'abc' }).decision).toBe('invalid_evidence');
  });

  it('refuses duplicate, conflicting, unexpected and malformed results', () => {
    const a03 = baseEval.results.find((r) => r.gateId === 'A03')!;
    const dup = accept([...baseEval.results, { ...a03, id: 'FIXTURE-dup' }]);
    expect(dup.decision).toBe('invalid_evidence');
    expect(codes(dup)).toEqual(['duplicate_gate_result']);
    const conflict = accept([...baseEval.results, { ...a03, id: 'FIXTURE-dup', outcome: 'fail', reason: 'x' }]);
    expect(codes(conflict)).toEqual(['conflicting_gate_results']);
    const unexpected = accept([...baseEval.results, { ...a03, id: 'FIXTURE-extra', gateId: 'A99' }]);
    expect(codes(unexpected)).toEqual(['unexpected_gate_result']);
    const malformed = accept(withGate('A03', { logArtifactId: null }));
    expect(codes(malformed)).toEqual(expect.arrayContaining(['invalid_gate_result', 'missing_required_result']));
    expect(malformed.decision).toBe('invalid_evidence');
  });

  it('is deterministic and does not mutate its inputs', () => {
    const results = withGate('A03', { outcome: 'fail', reason: 'x' });
    const before = clone({ profile: base.gateProfile, identity: baseIdentity, results });
    const a = accept(results);
    const b = accept([...results].reverse());
    expect(b).toEqual(a);
    expect({ profile: base.gateProfile, identity: baseIdentity, results }).toEqual(before);
  });
});

describe('FIXTURE scenarios (CONTRACT-03)', () => {
  it('covers every required scenario', () => {
    expect(FIXTURE_SCENARIOS.map((s) => s.key).sort()).toEqual([
      'ambiguous-provider-creation',
      'capability-growth',
      'gate-proposal-held',
      'invalid-input-refusal',
      'missing-gate-evidence',
      'pending-cancellation',
      'rejection-then-repair',
      'stale-candidate',
      'successful-repair',
      'unknown-usage',
    ]);
  });

  for (const s of FIXTURE_SCENARIOS) {
    describe(s.key, () => {
      it('validates, is labeled FIXTURE and never counts as a real run', () => {
        const parsed = FixtureScenario.safeParse(s);
        expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);
        expect(s).toMatchObject({ label: 'FIXTURE', provenance: 'fixture', countsAsRealRun: false });
        // Round-trips as plain JSON (what W06 and recordings consume).
        expect(FixtureScenario.parse(JSON.parse(JSON.stringify(s)))).toEqual(s);
      });

      it('status path replays legally to the recorded incident state', () => {
        const { steps, state } = replayStatusPath(s);
        steps.forEach((r, i) => expect(r, `step ${i} -> ${s.statusPath[i].to}`).toMatchObject({ ok: true }));
        expect(state.status).toBe(s.incident.status);
        expect(state.block && { fromStatus: state.block.fromStatus, reason: state.block.reason }).toEqual(
          s.incident.block && { fromStatus: s.incident.block.fromStatus, reason: s.incident.block.reason },
        );
        expect(state.cancelRequested).toBe(s.incident.cancellation !== null);
        expect(state.acceptedIdentity).toEqual(s.incident.acceptedIdentity);
      });

      it('evaluations produce their expected acceptance decision', () => {
        for (const e of s.evaluations) {
          expect(evaluateAcceptance(s.gateProfile, identityFor(s, e.candidateSha), e.results).decision).toBe(e.expectedDecision);
        }
      });
    });
  }

  it('scenario-specific guarantees hold', () => {
    const stale = fixtureScenario('stale-candidate');
    const reused = stale.evaluations[1];
    expect(codes(evaluateAcceptance(stale.gateProfile, identityFor(stale, reused.candidateSha), reused.results))).toContain('candidate_mismatch');

    const usage = fixtureScenario('unknown-usage');
    expect(usage.budgetObservations.length).toBeGreaterThan(0);
    for (const o of usage.budgetObservations) expect(o.amount).toBeNull();

    const cancel = replayStatusPath(fixtureScenario('pending-cancellation')).state;
    expect(transitionIncident(cancel, 'cancelled', ctx({ activeRemoteSessions: 1 })).ok).toBe(false);
    expect(transitionIncident(cancel, 'evaluating', ctx()).ok).toBe(false);

    const held = fixtureScenario('gate-proposal-held');
    expect(held.decisions.map((d) => d.result)).toEqual(['pending']);
    expect(transitionIncident(replayStatusPath(held).state, 'evaluating', ctx())).toMatchObject({ ok: false, error: 'block_unresolved' });

    const invalid = fixtureScenario('invalid-input-refusal');
    expect(invalid.attempts).toEqual([]);
    expect(invalid.events.at(-1)).toMatchObject({ type: 'incident.refused', payload: { reason: 'invalid_input' } });
  });

  it('rejects an unlabeled or real-run-claiming fixture', () => {
    expect(FixtureScenario.safeParse({ ...base, label: 'LIVE' }).success).toBe(false);
    expect(FixtureScenario.safeParse({ ...base, countsAsRealRun: true }).success).toBe(false);
    expect(FixtureScenario.safeParse({ ...base, incident: { ...base.incident, id: 'inc-real' } }).success).toBe(false);
  });
});
