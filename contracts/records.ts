import { z } from 'zod';
import { DurationMs, GitSha, Id, ReasonCode, RelativePath, SchemaVersion, Sha256, Timestamp } from './primitives';

// ---------------------------------------------------------------------------
// Incident status (state machine lives in ./state.ts)

export const INCIDENT_STATUSES = [
  'received',
  'reproducing',
  'engineering',
  'evaluating',
  'accepted',
  'releasing',
  'completed',
  'refused',
  'blocked',
  'budget_exhausted',
  'cancel_pending',
  'cancelled',
] as const;
export const IncidentStatus = z.enum(INCIDENT_STATUSES);
export type IncidentStatus = z.infer<typeof IncidentStatus>;

/** Phases a resolved block may return to. */
export const ACTIONABLE_PHASES = ['reproducing', 'engineering', 'evaluating', 'accepted', 'releasing'] as const;
export const ActionablePhase = z.enum(ACTIONABLE_PHASES);

const BLOCKABLE_FROM = [...ACTIONABLE_PHASES, 'cancel_pending'] as const;

export const BlockRecord = z
  .object({
    /** Status the incident was in when it blocked; resumption may only return here. */
    fromStatus: z.enum(BLOCKABLE_FROM),
    reason: ReasonCode,
    blockedAt: Timestamp,
    resolution: z.object({ decisionId: Id, resolvedAt: Timestamp }).strict().nullable(),
  })
  .strict();
export type BlockRecord = z.infer<typeof BlockRecord>;

export const CancellationIntent = z.object({ requestedAt: Timestamp, requestedBy: z.string().min(1) }).strict();

/** Exact identity an acceptance verdict (and later release) is bound to. */
export const AcceptanceIdentity = z
  .object({ candidateSha: GitSha, evaluatorRevision: GitSha, inputHash: Sha256, acceptanceContractHash: Sha256 })
  .strict();
export type AcceptanceIdentity = z.infer<typeof AcceptanceIdentity>;

export const sameAcceptanceIdentity = (a: AcceptanceIdentity | null | undefined, b: AcceptanceIdentity | null | undefined): boolean =>
  !!a &&
  !!b &&
  a.candidateSha === b.candidateSha &&
  a.evaluatorRevision === b.evaluatorRevision &&
  a.inputHash === b.inputHash &&
  a.acceptanceContractHash === b.acceptanceContractHash;

/** Statuses whose incident must carry the accepted identity (directly or while blocked from them). */
export const ACCEPTANCE_BOUND_STATUSES = ['accepted', 'releasing', 'completed'] as const;

export const Incident = z
  .object({
    schemaVersion: SchemaVersion,
    id: Id,
    revision: z.number().int().nonnegative(),
    targetLibrary: Id,
    trigger: z
      .object({ kind: z.enum(['http', 'file', 'ci']), idempotencyKey: z.string().min(1).max(256), receivedAt: Timestamp })
      .strict(),
    requestedOutcome: z
      .object({ kind: z.enum(['repair', 'capability', 'gate_strengthening']), summary: z.string().min(1) })
      .strict(),
    requestHash: Sha256,
    /** Hash of the canonical input manifest; every gate result must be bound to it. */
    inputsHash: Sha256,
    sourceArtifacts: z.array(z.object({ artifactId: Id, sha256: Sha256 }).strict()),
    baseCommit: GitSha,
    /** Hash of the frozen gate profile (see hashGateProfile). */
    acceptanceContractHash: Sha256,
    evaluatorRevision: GitSha,
    policyRevision: z.string().min(1),
    status: IncidentStatus,
    block: BlockRecord.nullable(),
    cancellation: CancellationIntent.nullable(),
    /** Set on `-> accepted`; carried through release/completion (and blocks from them). */
    acceptedIdentity: AcceptanceIdentity.nullable(),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  })
  .strict()
  .superRefine((inc, ctx) => {
    const bound = (ACCEPTANCE_BOUND_STATUSES as readonly string[]).includes(
      inc.status === 'blocked' && inc.block ? inc.block.fromStatus : inc.status,
    );
    if (bound && inc.acceptedIdentity === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['acceptedIdentity'], message: `${inc.status} requires accepted identity` });
    }
    const a = inc.acceptedIdentity;
    if (
      a &&
      (a.inputHash !== inc.inputsHash ||
        a.evaluatorRevision !== inc.evaluatorRevision ||
        a.acceptanceContractHash !== inc.acceptanceContractHash)
    ) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['acceptedIdentity'], message: 'accepted identity not bound to frozen incident contract' });
    }
    if ((inc.status === 'blocked') !== (inc.block !== null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['block'], message: 'block record present iff status is blocked' });
    }
    if ((inc.status === 'cancel_pending' || inc.status === 'cancelled') && inc.cancellation === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cancellation'], message: 'cancellation requires recorded intent' });
    }
  });
export type Incident = z.infer<typeof Incident>;

// ---------------------------------------------------------------------------
// Harness session / attempts / provider operations

export const SESSION_STATES = ['queued', 'running', 'waiting', 'finished', 'failed', 'cancelled', 'unknown'] as const;
/** Normalized provider session state. `finished` = engineering turn ended, not "patch passed". */
export const SessionState = z.enum(SESSION_STATES);
export type SessionState = z.infer<typeof SessionState>;
const ATTEMPT_STATUSES = ['dispatch_pending', ...SESSION_STATES] as const;

export const BudgetReservation = z
  .object({ reservationId: Id, unit: z.string().min(1), maxAmount: z.number().finite().nonnegative() })
  .strict();

export const Attempt = z
  .object({
    schemaVersion: SchemaVersion,
    id: Id,
    incidentId: Id,
    ordinal: z.number().int().positive(),
    harnessId: Id,
    providerOperationId: Id,
    remoteSessionId: z.string().min(1).nullable(),
    /** `dispatch_pending` precedes any remote session; otherwise the normalized session state. */
    status: z.enum(ATTEMPT_STATUSES),
    candidateSha: GitSha.nullable(),
    budgetReservation: BudgetReservation,
    createdAt: Timestamp,
    updatedAt: Timestamp,
  })
  .strict();
export type Attempt = z.infer<typeof Attempt>;

export const RECONCILIATION_RESULTS = ['found', 'not_found_confirmed', 'ambiguous', 'unsupported'] as const;
export const ReconciliationResult = z.enum(RECONCILIATION_RESULTS);

export const ProviderOperation = z
  .object({
    schemaVersion: SchemaVersion,
    id: Id,
    incidentId: Id,
    attemptId: Id.nullable(),
    harnessId: Id,
    kind: z.enum(['create', 'feedback', 'cancel']),
    /** Intent is persisted before sending. A send whose response was lost is `unknown_outcome`, never `failed`. */
    status: z.enum(['intent_recorded', 'sent', 'confirmed', 'failed_before_send', 'unknown_outcome']),
    remoteId: z.string().min(1).nullable(),
    reconciliation: ReconciliationResult.nullable(),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  })
  .strict();
export type ProviderOperation = z.infer<typeof ProviderOperation>;

/**
 * Only authoritative non-creation permits automatic redispatch. `ambiguous` and
 * `unsupported` must block and surface instead.
 */
export function mayRedispatch(op: ProviderOperation): boolean {
  if (op.status === 'failed_before_send') return true;
  return op.status === 'unknown_outcome' && op.reconciliation === 'not_found_confirmed';
}

export const Candidate = z
  .object({
    schemaVersion: SchemaVersion,
    attemptId: Id,
    repo: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'expected owner/name'),
    baseSha: GitSha,
    candidateSha: GitSha,
    /** Untrusted agent text; never evidence. */
    agentSummary: z.string(),
    proposedTests: z.array(z.string()),
    /** Recomputed by the controller from Git, not taken from the agent. */
    changedPaths: z.object({ computedBy: z.literal('controller'), paths: z.array(RelativePath) }).strict(),
  })
  .strict()
  .refine((c) => c.candidateSha !== c.baseSha, { message: 'candidate must differ from base', path: ['candidateSha'] });
export type Candidate = z.infer<typeof Candidate>;

// ---------------------------------------------------------------------------
// Gates, artifacts, releases, budgets, decisions

export const GATE_OUTCOMES = ['pass', 'fail', 'error', 'not_run', 'not_applicable'] as const;
export const GateOutcome = z.enum(GATE_OUTCOMES);
export type GateOutcome = z.infer<typeof GateOutcome>;

export const GateResult = z
  .object({
    schemaVersion: SchemaVersion,
    id: Id,
    gateId: Id,
    gateVersion: z.number().int().positive(),
    candidateSha: GitSha,
    evaluatorRevision: GitSha,
    inputHash: Sha256,
    outcome: GateOutcome,
    reason: ReasonCode,
    expected: z.unknown().nullable(),
    actual: z.unknown().nullable(),
    logArtifactId: Id.nullable(),
    durationMs: DurationMs.nullable(),
    runnerIdentity: z.string().min(1),
    startedAt: Timestamp,
    finishedAt: Timestamp,
  })
  .strict()
  .superRefine((g, ctx) => {
    // Missing evidence never becomes a green check.
    if (g.outcome === 'pass' && (g.logArtifactId === null || g.durationMs === null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['logArtifactId'], message: 'pass requires log artifact and duration' });
    }
  });
export type GateResult = z.infer<typeof GateResult>;

export const ARTIFACT_PURPOSES = [
  'request_input',
  'reproduction',
  'candidate_patch',
  'gate_log',
  'rendered_output',
  'package',
  'evidence_manifest',
  'feedback',
  'gate_proposal',
  'other',
] as const;

export const Artifact = z
  .object({
    schemaVersion: SchemaVersion,
    id: Id,
    sha256: Sha256,
    mimeType: z.string().regex(/^[a-z]+\/[A-Za-z0-9.+-]+$/),
    sizeBytes: z.number().int().nonnegative(),
    purpose: z.enum(ARTIFACT_PURPOSES),
    producedBy: z.object({ attemptId: Id.nullable(), gateResultId: Id.nullable() }).strict(),
    createdAt: Timestamp,
  })
  .strict();
export type Artifact = z.infer<typeof Artifact>;

export const Release = z
  .object({
    schemaVersion: SchemaVersion,
    id: Id,
    incidentId: Id,
    acceptedSha: GitSha,
    packageHash: Sha256,
    outputArtifactHash: Sha256,
    manifestHash: Sha256,
    gateResultIds: z.array(Id).min(1),
    priorReleaseId: Id.nullable(),
    destination: z.literal('local_demo_registry'),
    activatedAt: Timestamp,
  })
  .strict();
export type Release = z.infer<typeof Release>;

export const UsageReliability = z.enum(['reported', 'estimated', 'unknown']);

/** Usage is observational and may lag. Unknown stays `null`; it is never coerced to 0. */
export const BudgetObservation = z
  .object({
    schemaVersion: SchemaVersion,
    provider: Id,
    amount: z.number().finite().nonnegative().nullable(),
    unit: z.string().min(1),
    observedAt: Timestamp,
    source: z.enum(['provider_api', 'provider_dashboard', 'controller_estimate', 'operator_report']),
    reliability: UsageReliability,
  })
  .strict()
  .refine((b) => (b.reliability === 'unknown') === (b.amount === null), {
    message: 'amount is null exactly when reliability is unknown',
    path: ['amount'],
  });
export type BudgetObservation = z.infer<typeof BudgetObservation>;

export const DecisionActor = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('policy') }).strict(),
  z.object({ kind: z.literal('human'), id: z.string().min(1) }).strict(),
]);

export const Decision = z
  .object({
    schemaVersion: SchemaVersion,
    id: Id,
    incidentId: Id,
    scope: z.enum(['block_resolution', 'release', 'gate_adoption', 'contract_definition', 'policy_change', 'cancellation']),
    actor: DecisionActor,
    /** `pending` means awaiting an explicit resolution; it authorizes nothing. */
    result: z.enum(['pending', 'approved', 'rejected']),
    reason: z.string().min(1),
    policyVersion: z.string().min(1),
    evidenceIds: z.array(Id),
    decidedAt: Timestamp,
  })
  .strict();
export type Decision = z.infer<typeof Decision>;
