// Browser-safe gate-profile schemas and verdict types. Evaluation itself is server-only (./gates).
import { z } from 'zod';
import { GitSha, Id, SchemaVersion } from './primitives';
import type { AcceptanceIdentity } from './records';

export const GateDefinition = z
  .object({
    gateId: Id,
    gateVersion: z.number().int().positive(),
    /** `supporting` results are reported but cannot authorize or veto acceptance on their own. */
    requirement: z.enum(['required', 'supporting']),
    /** Frozen, explicit exclusion for this request. Only then may `not_applicable` satisfy a required gate. */
    notApplicableAllowed: z.boolean(),
  })
  .strict();
export type GateDefinition = z.infer<typeof GateDefinition>;

/** Frozen acceptance profile. Its canonical hash is the incident's `acceptanceContractHash`. */
export const GateProfile = z
  .object({
    schemaVersion: SchemaVersion,
    profileId: Id,
    libraryId: Id,
    evaluatorRevision: GitSha,
    gates: z.array(GateDefinition),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (!p.gates.some((g) => g.requirement === 'required')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gates'], message: 'profile needs at least one required gate' });
    }
    const ids = p.gates.map((g) => g.gateId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gates'], message: 'duplicate gate id in profile' });
    }
  });
export type GateProfile = z.infer<typeof GateProfile>;

/** Evidence/contract problems: nothing in the result set can be trusted. */
export const ACCEPTANCE_EVIDENCE_CODES = [
  'invalid_profile',
  'empty_required_gates',
  'invalid_identity',
  'profile_hash_mismatch',
  'profile_evaluator_mismatch',
  'invalid_gate_result',
  'unexpected_gate_result',
  'gate_version_mismatch',
  'candidate_mismatch',
  'evaluator_mismatch',
  'input_mismatch',
  'duplicate_gate_result',
  'conflicting_gate_results',
] as const;
/** Required gate did not produce a usable verdict: hold, not a semantic rejection. */
export const ACCEPTANCE_INCOMPLETE_CODES = ['missing_required_result', 'gate_error', 'gate_not_run', 'not_applicable_disallowed'] as const;

export const ACCEPTANCE_ISSUE_CODES = [
  ...ACCEPTANCE_EVIDENCE_CODES,
  ...ACCEPTANCE_INCOMPLETE_CODES,
  'gate_failed',
  'supporting_gate_not_passed',
] as const;
export type AcceptanceIssueCode = (typeof ACCEPTANCE_ISSUE_CODES)[number];

export interface AcceptanceIssue {
  readonly code: AcceptanceIssueCode;
  readonly gateId: string | null;
  readonly resultId: string | null;
  readonly blocking: boolean;
  readonly detail: string;
}

/**
 * - `accepted`: every required gate has exactly one bound result that passed (or an allowed not_applicable).
 * - `rejected`: bound evidence shows a required gate failed; eligible for repair feedback.
 * - `incomplete`: a required verdict is missing, errored, not run, or disallowed not_applicable. Hold, do not reject.
 * - `invalid_evidence`: profile or result set is untrustworthy (mismatch, duplicate, unexpected, empty profile).
 */
export const ACCEPTANCE_DECISIONS = ['accepted', 'rejected', 'incomplete', 'invalid_evidence'] as const;
export type AcceptanceDecision = (typeof ACCEPTANCE_DECISIONS)[number];

/** Produced only by the server-side evaluateAcceptance; frozen. Display copies are not authority. */
export interface AcceptanceVerdict {
  readonly decision: AcceptanceDecision;
  readonly accepted: boolean;
  /** Identity the verdict was computed for; null when the identity itself was malformed. */
  readonly identity: Readonly<AcceptanceIdentity> | null;
  readonly issues: readonly AcceptanceIssue[];
  readonly passedRequiredGateIds: readonly string[];
}
