import { z } from 'zod';
import type { GateProfile } from './profile';
import { DurationMs, GitSha, Id, ReasonCode, RelativePath, Sha256, Timestamp } from './primitives';
import { BudgetObservation, GateResult, ReconciliationResult, SessionState, type Artifact, type Candidate } from './records';

// ---------------------------------------------------------------------------
// Harness (engineering provider). Devin is one implementation.

export const HarnessCapabilities = z
  .object({
    feedback: z.boolean(),
    resume: z.boolean(),
    creationReconciliation: z.boolean(),
    structuredResults: z.boolean(),
    termination: z.boolean(),
    usageUnits: z.array(z.string().min(1)),
    /** False means the provider cannot enforce a spend ceiling; policy must decide. */
    enforceableUsageCeiling: z.boolean(),
    candidateTransport: z.enum(['git_push', 'patch_artifact', 'none']),
  })
  .strict();
export type HarnessCapabilities = z.infer<typeof HarnessCapabilities>;

const CREDENTIAL_KEY = /token|secret|password|api[_-]?key|authorization|credential/i;

export const EngineeringTask = z
  .object({
    incidentId: Id,
    repo: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    baseSha: GitSha,
    reproductionArtifactIds: z.array(Id),
    contractSummary: z.string().min(1),
    allowedPaths: z.array(RelativePath).min(1),
    protectedPaths: z.array(RelativePath),
    resultSchemaId: Id,
    deadline: Timestamp,
    /** Typed per-provider extension (e.g. budget policy). Never controller credentials. */
    providerExtension: z.record(z.unknown()),
  })
  .strict()
  .refine((t) => !Object.keys(t.providerExtension).some((k) => CREDENTIAL_KEY.test(k)), {
    message: 'engineering task must not carry credentials',
    path: ['providerExtension'],
  });
export type EngineeringTask = z.infer<typeof EngineeringTask>;

export const RepairFeedback = z
  .object({
    candidateSha: GitSha,
    acceptanceContractHash: Sha256,
    gateResults: z.array(GateResult).min(1),
    counterexamples: z.array(z.unknown()),
    remainingAttempts: z.number().int().nonnegative(),
    deadline: Timestamp,
  })
  .strict();
export type RepairFeedback = z.infer<typeof RepairFeedback>;

/** `unknown_outcome`: sent but response lost. Must reconcile; never blindly resend. */
export const StartOutcome = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('created'), remoteId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('rejected'), reason: ReasonCode }).strict(),
  z.object({ kind: z.literal('unknown_outcome'), reason: ReasonCode }).strict(),
]);
export type StartOutcome = z.infer<typeof StartOutcome>;

export const ReconciliationOutcome = z.discriminatedUnion('result', [
  z.object({ result: z.literal('found'), remoteId: z.string().min(1) }).strict(),
  z.object({ result: z.literal('not_found_confirmed') }).strict(),
  z.object({ result: z.literal('ambiguous'), reason: ReasonCode }).strict(),
  z.object({ result: z.literal('unsupported') }).strict(),
]);
export type ReconciliationOutcome = z.infer<typeof ReconciliationOutcome>;
// Keep the record enum and the outcome union in lockstep.
const _reconciliationLockstep: ReconciliationOutcome['result'] extends z.infer<typeof ReconciliationResult> ? true : never = true;
void _reconciliationLockstep;

/** Agent-reported diagnostics only; never release gate evidence. */
export const AgentQualityReview = z.object({
  provider:z.literal('norma'), status:z.enum(['clean','issues','pending']), candidateSha:GitSha,
  checkedFiles:z.array(z.string().max(512)).max(100), findings:z.array(z.string().max(2000)).max(100),
  coverageReduced:z.boolean(), limitations:z.array(z.string().max(2000)).max(30),
}).strict();

export const SessionObservation = z
  .object({
    remoteId: z.string().min(1),
    state: SessionState,
    /** Raw provider status is preserved as server evidence (artifact ID), not interpreted here. */
    rawStatusArtifactId: Id.nullable(),
    observedAt: Timestamp,
    providerTime: Timestamp.nullable(),
    candidateSha: GitSha.nullable(),
    usage: BudgetObservation.nullable(),
    qualityReview: AgentQualityReview.optional(),
  })
  .strict();
export type SessionObservation = z.infer<typeof SessionObservation>;

export const FeedbackOutcome = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('delivered') }).strict(),
  z.object({ kind: z.literal('rejected'), reason: ReasonCode }).strict(),
  z.object({ kind: z.literal('unknown_outcome'), reason: ReasonCode }).strict(),
]);
export type FeedbackOutcome = z.infer<typeof FeedbackOutcome>;

/** Only `confirmed` permits leaving cancel_pending for cancelled. */
export const CancelOutcome = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('confirmed'), confirmedAt: Timestamp }).strict(),
  z.object({ kind: z.literal('requested') }).strict(),
  z.object({ kind: z.literal('failed'), reason: ReasonCode }).strict(),
  z.object({ kind: z.literal('unsupported') }).strict(),
]);
export type CancelOutcome = z.infer<typeof CancelOutcome>;

export interface HarnessAdapter {
  id: string;
  capabilities(): HarnessCapabilities;
  start(task: EngineeringTask, operationId: string): Promise<StartOutcome>;
  reconcile(operationId: string): Promise<ReconciliationOutcome>;
  inspect(remoteId: string): Promise<SessionObservation>;
  feedback(remoteId: string, feedback: RepairFeedback, operationId: string): Promise<FeedbackOutcome>;
  cancel(remoteId: string, operationId: string): Promise<CancelOutcome>;
}

// ---------------------------------------------------------------------------
// Library adapter and runner

/** Allowlisted command with an argv array. No shell strings; originates from a trusted adapter. */
export const ExecutionPlan = z
  .object({
    planId: Id,
    commandId: Id,
    argv: z.array(z.string()).min(1),
    runtimeImage: z.string().min(1),
    mounts: z
      .array(z.object({ artifactId: Id, sha256: Sha256, target: RelativePath, readOnly: z.boolean() }).strict()),
    ceilings: z
      .object({
        wallMs: DurationMs,
        memoryMb: z.number().int().positive(),
        outputBytes: z.number().int().positive(),
        artifactBytes: z.number().int().positive(),
      })
      .strict(),
    network: z.enum(['none', 'allowlisted']),
  })
  .strict();
export type ExecutionPlan = z.infer<typeof ExecutionPlan>;

export const ImmutableInputs = z
  .object({ candidateSha: GitSha.nullable(), evaluatorRevision: GitSha, artifacts: z.array(z.object({ artifactId: Id, sha256: Sha256 }).strict()) })
  .strict();
export type ImmutableInputs = z.infer<typeof ImmutableInputs>;

export const ExecutionEvidence = z
  .object({
    runId: Id,
    planId: Id,
    runnerIdentity: z.string().min(1),
    /** `container`/`external_vm` only for a real execution boundary; a git worktree is `process`. */
    isolation: z.enum(['container', 'external_vm', 'process', 'unavailable']),
    exitCode: z.number().int().nullable(),
    outcome: z.enum(['completed', 'timeout', 'resource_limit', 'infrastructure_error', 'cancelled']),
    durationMs: DurationMs,
    artifactIds: z.array(Id),
    startedAt: Timestamp,
    finishedAt: Timestamp,
  })
  .strict();
export type ExecutionEvidence = z.infer<typeof ExecutionEvidence>;

export const CancellationEvidence = z
  .object({ runId: Id, confirmed: z.boolean(), observedAt: Timestamp, reason: ReasonCode.nullable() })
  .strict();
export type CancellationEvidence = z.infer<typeof CancellationEvidence>;

/** Opaque to the controller; the library adapter owns its shape. */
export interface ValidatedRequest {
  libraryId: string;
  requestHash: string;
  inputsHash: string;
  payload: unknown;
}

export interface EngineeringScope {
  allowedPaths: string[];
  protectedPaths: string[];
}

/** The protected acceptance profile is the frozen gate profile. */
export type AcceptanceProfile = GateProfile;

export interface LibraryAdapter {
  id: string;
  /** Throws or returns a refusal distinct from library defects (input invalidity is not a repair case). */
  validateRequest(input: unknown): ValidatedRequest;
  acceptanceProfile(request: ValidatedRequest): AcceptanceProfile;
  reproductionPlan(request: ValidatedRequest): ExecutionPlan;
  engineeringScope(request: ValidatedRequest): EngineeringScope;
  evaluationPlan(request: ValidatedRequest, candidate: Candidate): ExecutionPlan;
  packagingPlan(candidate: Candidate): ExecutionPlan;
  regenerationPlan(request: ValidatedRequest, built: Artifact): ExecutionPlan;
}

export interface ExecutionRunner {
  run(plan: ExecutionPlan, inputs: ImmutableInputs): Promise<ExecutionEvidence>;
  cancel(runId: string): Promise<CancellationEvidence>;
}
