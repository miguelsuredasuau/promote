// FIXTURE factories. Everything produced here is labeled FIXTURE, uses `FIXTURE-` IDs
// and synthetic hashes, and must never be presented or counted as a real run.
import { z } from 'zod';
import {
  ACCEPTANCE_BOUND_STATUSES,
  ACCEPTANCE_DECISIONS,
  Artifact,
  Attempt,
  BudgetObservation,
  Candidate,
  Decision,
  GateProfile,
  GateResult,
  GitSha,
  Incident,
  IncidentStatus,
  ProviderOperation,
  Release,
  SCHEMA_VERSION,
  WorkshopEvent,
  evaluateAcceptance,
  hashGateProfile,
  requestCancellation,
  resolveBlock,
  sha256Hex,
  transitionIncident,
  type AcceptanceIdentity,
  type EventType,
  type GateDefinition,
  type GateOutcome,
  type IncidentMachineState,
  type TransitionResult,
} from '../../contracts';

export const FIXTURE_LABEL = 'FIXTURE' as const;
const PREFIX = 'FIXTURE-';

const T0 = Date.parse('2026-09-19T08:00:00.000Z');
export const fxTime = (minute: number) => new Date(T0 + minute * 60_000).toISOString();
export const fxSha256 = (label: string) => sha256Hex(`FIXTURE:${label}`);
export const fxGitSha = (label: string) => sha256Hex(`FIXTURE:git:${label}`).slice(0, 40);

export const FX_REPO = 'example/sample-library';
export const FX_BASE = fxGitSha('base');
export const FX_EVALUATOR = fxGitSha('evaluator-v1');
export const FX_HARNESS = 'devin';

const gate = (gateId: string, requirement: GateDefinition['requirement'] = 'required', notApplicableAllowed = false): GateDefinition => ({
  gateId,
  gateVersion: 1,
  requirement,
  notApplicableAllowed,
});

/** Frozen repair profile (gate IDs from 03-acceptance-and-demo.md). */
export function fxProfile(profileId = 'FIXTURE-sample-repair-v1', overrides: Partial<Record<string, GateDefinition>> = {}): GateProfile {
  const gates = [gate('A00'), gate('A02'), gate('A03'), gate('A04'), gate('A05'), gate('A07', 'supporting')];
  return {
    schemaVersion: SCHEMA_VERSION,
    profileId,
    libraryId: 'sample-library',
    evaluatorRevision: FX_EVALUATOR,
    gates: gates.map((g) => overrides[g.gateId] ?? g),
  };
}

const LiveCountSchema = z.union([z.number().int().nonnegative(), z.literal('unknown')]);

export const StatusStep = z
  .object({
    to: IncidentStatus,
    activeRemoteSessions: LiveCountSchema.optional(),
    activeLocalProcesses: LiveCountSchema.optional(),
    blockReason: z.string().optional(),
    requestCancellation: z.literal(true).optional(),
    resolveBlockDecisionId: z.string().optional(),
    /** Sets the controller's current candidate (sticky for later steps); `-> accepted` evaluates it. */
    candidateSha: GitSha.optional(),
  })
  .strict();
export type StatusStep = z.infer<typeof StatusStep>;

export const Evaluation = z
  .object({
    candidateSha: GitSha,
    results: z.array(GateResult),
    expectedDecision: z.enum(ACCEPTANCE_DECISIONS),
  })
  .strict();
export type Evaluation = z.infer<typeof Evaluation>;

const fixtureId = (path: string) => z.string().startsWith(PREFIX, `${path} must start with ${PREFIX}`);

export const FixtureScenario = z
  .object({
    label: z.literal(FIXTURE_LABEL),
    provenance: z.literal('fixture'),
    countsAsRealRun: z.literal(false),
    key: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1),
    incident: Incident,
    gateProfile: GateProfile,
    attempts: z.array(Attempt),
    providerOperations: z.array(ProviderOperation),
    candidates: z.array(Candidate),
    evaluations: z.array(Evaluation),
    artifacts: z.array(Artifact),
    releases: z.array(Release),
    budgetObservations: z.array(BudgetObservation),
    decisions: z.array(Decision),
    events: z.array(WorkshopEvent).min(1),
    statusPath: z.array(StatusStep),
  })
  .strict()
  .superRefine((s, ctx) => {
    const ids = [
      s.incident.id,
      ...s.attempts.map((a) => a.id),
      ...s.attempts.flatMap((a) => (a.remoteSessionId ? [a.remoteSessionId] : [])),
      ...s.providerOperations.map((o) => o.id),
      ...s.events.map((e) => e.eventId),
      ...s.evaluations.flatMap((e) => e.results.map((r) => r.id)),
      ...s.artifacts.map((a) => a.id),
      ...s.decisions.map((d) => d.id),
      ...s.releases.map((r) => r.id),
    ];
    for (const id of ids) {
      if (!fixtureId('id').safeParse(id).success) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `id ${id} lacks ${PREFIX}` });
    }
    if (s.incident.acceptanceContractHash !== hashGateProfile(s.gateProfile)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['incident'], message: 'acceptanceContractHash != hash(gateProfile)' });
    }
    s.events.forEach((e, i) => {
      if (e.incidentId !== s.incident.id) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['events', i], message: 'foreign incident' });
      if (i > 0 && e.sequence <= s.events[i - 1].sequence) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['events', i], message: 'sequence not monotonic' });
      }
    });
    const last = s.statusPath.at(-1)?.to ?? 'received';
    if (last !== s.incident.status) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['statusPath'], message: 'path does not end at incident status' });
  });
export type FixtureScenario = z.infer<typeof FixtureScenario>;

export const identityFor = (s: FixtureScenario, candidateSha: string): AcceptanceIdentity => ({
  candidateSha,
  evaluatorRevision: s.incident.evaluatorRevision,
  inputHash: s.incident.inputsHash,
  acceptanceContractHash: s.incident.acceptanceContractHash,
});

/** Replays a scenario's status path through the contract state machine from `received`. */
export function replayStatusPath(s: FixtureScenario): { steps: TransitionResult[]; state: IncidentMachineState } {
  let state: IncidentMachineState = { status: 'received', block: null, cancelRequested: false, acceptedIdentity: null };
  let currentCandidate: string | undefined;
  const steps: TransitionResult[] = [];
  s.statusPath.forEach((step, i) => {
    const now = fxTime(1000 + i);
    if (step.requestCancellation) state = requestCancellation(state);
    if (step.resolveBlockDecisionId) state = resolveBlock(state, step.resolveBlockDecisionId, now);
    if (step.candidateSha) currentCandidate = step.candidateSha;
    const currentIdentity = currentCandidate ? identityFor(s, currentCandidate) : undefined;
    const evaluation = step.to === 'accepted' ? s.evaluations.find((e) => e.candidateSha === currentCandidate) : undefined;
    const result = transitionIncident(state, step.to, {
      now,
      activeRemoteSessions: step.activeRemoteSessions ?? 0,
      activeLocalProcesses: step.activeLocalProcesses ?? 0,
      blockReason: step.blockReason,
      currentIdentity,
      acceptance: evaluation && currentIdentity ? evaluateAcceptance(s.gateProfile, currentIdentity, evaluation.results) : undefined,
    });
    steps.push(result);
    if (result.ok) state = result.state;
  });
  return { steps, state };
}

// ---------------------------------------------------------------------------
// Scenario builder

type Draft = Omit<FixtureScenario, 'incident' | 'statusPath'>;

export function scenarioBuilder(key: string, title: string, opts: { kind?: Incident['requestedOutcome']['kind']; profile?: GateProfile } = {}) {
  const incidentId = `${PREFIX}inc-${key}`;
  const profile = opts.profile ?? fxProfile();
  let minute = 0;
  let sequence = 0;
  const tick = () => fxTime(minute++);
  const draft: Draft = {
    label: FIXTURE_LABEL,
    provenance: 'fixture',
    countsAsRealRun: false,
    key,
    title,
    gateProfile: profile,
    attempts: [],
    providerOperations: [],
    candidates: [],
    evaluations: [],
    artifacts: [],
    releases: [],
    budgetObservations: [],
    decisions: [],
    events: [],
  };
  const createdAt = fxTime(0);

  const b = {
    incidentId,
    event(type: EventType, payload: Record<string, unknown> = {}, extra: { attemptId?: string; actor?: string } = {}): void {
      sequence += 1;
      draft.events.push({
        eventId: `${PREFIX}evt-${key}-${sequence}`,
        sequence,
        schemaVersion: SCHEMA_VERSION,
        type,
        incidentId,
        ...(extra.attemptId ? { attemptId: extra.attemptId } : {}),
        occurredAt: tick(),
        actor: extra.actor ?? 'controller',
        payload,
      });
    },
    artifact(label: string, purpose: Artifact['purpose'], mimeType = 'application/json', producedBy: Artifact['producedBy'] = { attemptId: null, gateResultId: null }): Artifact {
      const a: Artifact = {
        schemaVersion: SCHEMA_VERSION,
        id: `${PREFIX}art-${key}-${label}`,
        sha256: fxSha256(`${key}:${label}`),
        mimeType,
        sizeBytes: 1024,
        purpose,
        producedBy,
        createdAt: tick(),
      };
      draft.artifacts.push(a);
      return a;
    },
    op(label: string, kind: ProviderOperation['kind'], status: ProviderOperation['status'], attemptId: string | null, remoteId: string | null, reconciliation: ProviderOperation['reconciliation'] = null): ProviderOperation {
      const t = tick();
      const op: ProviderOperation = {
        schemaVersion: SCHEMA_VERSION,
        id: `${PREFIX}op-${key}-${label}`,
        incidentId,
        attemptId,
        harnessId: FX_HARNESS,
        kind,
        status,
        remoteId,
        reconciliation,
        createdAt: t,
        updatedAt: t,
      };
      draft.providerOperations.push(op);
      return op;
    },
    /** Records the create (or feedback) operation and the attempt it starts. */
    attempt(ordinal: number, o: {
      opKind?: 'create' | 'feedback';
      opStatus?: ProviderOperation['status'];
      reconciliation?: ProviderOperation['reconciliation'];
      remoteSessionId?: string | null;
      status?: Attempt['status'];
    } = {}): Attempt {
      const id = `${PREFIX}att-${key}-${ordinal}`;
      const remote = o.remoteSessionId === undefined ? `${PREFIX}devin-${key}` : o.remoteSessionId;
      const kind = o.opKind ?? 'create';
      const opId = b.op(String(ordinal), kind, o.opStatus ?? 'confirmed', id, o.opStatus === 'unknown_outcome' ? null : remote, o.reconciliation ?? null).id;
      const t = tick();
      const attempt: Attempt = {
        schemaVersion: SCHEMA_VERSION,
        id,
        incidentId,
        ordinal,
        harnessId: FX_HARNESS,
        providerOperationId: opId,
        remoteSessionId: remote,
        status: o.status ?? 'running',
        candidateSha: null,
        budgetReservation: { reservationId: `${PREFIX}res-${key}-${ordinal}`, unit: 'acu', maxAmount: 10 },
        createdAt: t,
        updatedAt: t,
      };
      draft.attempts.push(attempt);
      if (kind === 'feedback') {
        b.event('feedback.sent', { operationId: opId, remoteSessionId: remote }, { attemptId: id });
      } else {
        b.event('dispatch.pending', { operationId: opId, harnessId: FX_HARNESS }, { attemptId: id });
        if (remote) b.event('session.created', { operationId: opId, remoteSessionId: remote }, { attemptId: id, actor: 'harness_adapter' });
      }
      return attempt;
    },
    candidate(attempt: Attempt, label: string, baseSha = FX_BASE): Candidate {
      const c: Candidate = {
        schemaVersion: SCHEMA_VERSION,
        attemptId: attempt.id,
        repo: FX_REPO,
        baseSha,
        candidateSha: fxGitSha(`${key}:${label}`),
        agentSummary: `FIXTURE agent summary for ${label} (untrusted)`,
        proposedTests: ['tests/output-contract.test.ts'],
        changedPaths: { computedBy: 'controller', paths: ['core/data/bridge.ts'] },
      };
      attempt.candidateSha = c.candidateSha;
      attempt.status = 'finished';
      draft.candidates.push(c);
      if (attempt.remoteSessionId) {
        b.event('session.observed', { remoteSessionId: attempt.remoteSessionId, state: 'finished', providerTime: null }, { attemptId: attempt.id, actor: 'harness_adapter' });
      }
      b.event('candidate.received', { candidate: c }, { attemptId: attempt.id });
      return c;
    },
    result(candidateSha: string, gateId: string, outcome: GateOutcome, extra: Partial<GateResult> = {}): GateResult {
      const id = `${PREFIX}gate-${key}-${candidateSha.slice(0, 8)}-${gateId}`;
      const startedAt = tick();
      return {
        schemaVersion: SCHEMA_VERSION,
        id,
        gateId,
        gateVersion: 1,
        candidateSha,
        evaluatorRevision: FX_EVALUATOR,
        inputHash: fxSha256(`${key}:inputs`),
        outcome,
        reason: outcome === 'pass' ? 'ok' : outcome,
        expected: null,
        actual: null,
        logArtifactId: outcome === 'not_run' ? null : `${PREFIX}art-${key}-log-${gateId}`,
        durationMs: outcome === 'not_run' ? null : 1200,
        runnerIdentity: 'FIXTURE-runner',
        startedAt,
        finishedAt: startedAt,
        ...extra,
      };
    },
    /** Records an evaluation and emits gate.finished for each result unless `emit: false`. */
    evaluate(candidateSha: string, results: GateResult[], expectedDecision: Evaluation['expectedDecision'], emit = true): void {
      draft.evaluations.push({ candidateSha, results, expectedDecision });
      if (emit) for (const r of results) b.event('gate.finished', { result: r }, { actor: 'evaluator' });
    },
    /** Every standard profile gate passes for `candidateSha`. */
    allPass(candidateSha: string, overrides: Record<string, Partial<GateResult> & { outcome?: GateOutcome }> = {}): GateResult[] {
      return profile.gates.map((g) => b.result(candidateSha, g.gateId, overrides[g.gateId]?.outcome ?? 'pass', overrides[g.gateId]));
    },
    decision(label: string, scope: Decision['scope'], result: Decision['result'], reason: string, evidenceIds: string[] = []): Decision {
      const d: Decision = {
        schemaVersion: SCHEMA_VERSION,
        id: `${PREFIX}dec-${key}-${label}`,
        incidentId,
        scope,
        actor: { kind: 'policy' },
        result,
        reason,
        policyVersion: 'FIXTURE-policy-1',
        evidenceIds,
        decidedAt: tick(),
      };
      draft.decisions.push(d);
      b.event(result === 'pending' ? 'decision.pending' : 'decision.recorded', { decision: d }, { actor: 'policy' });
      return d;
    },
    usage(amount: number | null, reliability: BudgetObservation['reliability'], source: BudgetObservation['source'] = 'provider_api'): BudgetObservation {
      const o: BudgetObservation = { schemaVersion: SCHEMA_VERSION, provider: FX_HARNESS, amount, unit: 'acu', observedAt: tick(), source, reliability };
      draft.budgetObservations.push(o);
      b.event('budget.observed', { observation: o }, { actor: 'harness_adapter' });
      return o;
    },
    release(acceptedSha: string, gateResultIds: string[]): Release {
      b.event('release.started', { acceptedSha });
      const r: Release = {
        schemaVersion: SCHEMA_VERSION,
        id: `${PREFIX}rel-${key}`,
        incidentId,
        acceptedSha,
        packageHash: fxSha256(`${key}:package`),
        outputArtifactHash: fxSha256(`${key}:output`),
        manifestHash: fxSha256(`${key}:manifest`),
        gateResultIds,
        priorReleaseId: null,
        destination: 'local_demo_registry',
        activatedAt: tick(),
      };
      draft.releases.push(r);
      b.event('release.activated', { releaseId: r.id, acceptedSha });
      b.event('incident.completed', { releaseId: r.id });
      return r;
    },
    blocked(fromStatus: IncidentStatus, reason: string): void {
      b.event('incident.blocked', { fromStatus, reason });
    },
    finish(statusPath: StatusStep[], o: { cancellationRequested?: boolean } = {}): FixtureScenario {
      const status = statusPath.at(-1)?.to ?? 'received';
      const updatedAt = tick();
      const blockStep = statusPath.at(-1);
      const incident: Incident = {
        schemaVersion: SCHEMA_VERSION,
        id: incidentId,
        revision: statusPath.length,
        targetLibrary: 'sample-library',
        trigger: { kind: 'http', idempotencyKey: `${PREFIX}idem-${key}`, receivedAt: createdAt },
        requestedOutcome: { kind: opts.kind ?? 'repair', summary: `FIXTURE: ${title}` },
        requestHash: fxSha256(`${key}:request`),
        inputsHash: fxSha256(`${key}:inputs`),
        sourceArtifacts: [{ artifactId: `${PREFIX}art-${key}-request`, sha256: fxSha256(`${key}:request`) }],
        baseCommit: FX_BASE,
        acceptanceContractHash: hashGateProfile(profile),
        evaluatorRevision: FX_EVALUATOR,
        policyRevision: 'FIXTURE-policy-1',
        status,
        block:
          status === 'blocked' && blockStep?.blockReason
            ? {
                fromStatus: statusPath.at(-2)!.to as NonNullable<Incident['block']>['fromStatus'],
                reason: blockStep.blockReason,
                blockedAt: updatedAt,
                resolution: null,
              }
            : null,
        cancellation: o.cancellationRequested ? { requestedAt: updatedAt, requestedBy: 'human:FIXTURE-operator' } : null,
        acceptedIdentity: null,
        createdAt,
        updatedAt,
      };
      // Carry the accepted identity when the incident is in (or blocked from) an acceptance-bound phase.
      const phase = incident.block?.fromStatus ?? status;
      const acceptedSha = [...statusPath].reverse().find((st) => st.to === 'accepted')?.candidateSha;
      if ((ACCEPTANCE_BOUND_STATUSES as readonly string[]).includes(phase) && acceptedSha) {
        incident.acceptedIdentity = {
          candidateSha: acceptedSha,
          evaluatorRevision: incident.evaluatorRevision,
          inputHash: incident.inputsHash,
          acceptanceContractHash: incident.acceptanceContractHash,
        };
      }
      return { ...draft, incident, statusPath };
    },
  };
  b.event('incident.received', { idempotencyKey: `${PREFIX}idem-${key}` });
  b.artifact('request', 'request_input');
  return b;
}
