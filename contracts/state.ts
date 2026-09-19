// SERVER-ONLY: authoritative incident transition guard. Not re-exported by ./browser.
import { isTrustedVerdict } from './gates';
import { INCIDENT_TRANSITIONS, isTerminal } from './lifecycle';
import type { AcceptanceVerdict } from './profile';
import { ACTIONABLE_PHASES, sameAcceptanceIdentity, type AcceptanceIdentity, type BlockRecord, type IncidentStatus } from './records';

const isActionable = (s: IncidentStatus) => (ACTIONABLE_PHASES as readonly string[]).includes(s);

/** Minimal slice of an incident the state machine reads and writes. */
export interface IncidentMachineState {
  status: IncidentStatus;
  block: BlockRecord | null;
  cancelRequested: boolean;
  /** Identity bound on `-> accepted`; required unchanged for releasing/completed. */
  acceptedIdentity: AcceptanceIdentity | null;
}

/** Work not yet confirmed stopped. `unknown` is never treated as stopped. */
export type LiveCount = number | 'unknown';

export interface TransitionContext {
  now: string;
  /** Remote engineering sessions not confirmed stopped. */
  activeRemoteSessions: LiveCount;
  /** Local runner/evaluator/packaging processes not confirmed stopped. */
  activeLocalProcesses: LiveCount;
  /**
   * The controller's current identity for this incident: the exact candidate under
   * consideration plus frozen input hash, evaluator revision and profile hash.
   * Required for `-> accepted`, `-> releasing`, `-> completed`.
   */
  currentIdentity?: AcceptanceIdentity;
  /** Required for `-> accepted` from evaluating: a verdict minted by evaluateAcceptance. */
  acceptance?: AcceptanceVerdict;
  /** Required for `-> blocked`. */
  blockReason?: string;
}

export const TRANSITION_ERRORS = [
  'terminal_state',
  'illegal_transition',
  'blocked_resume_mismatch',
  'block_unresolved',
  'cancellation_requested',
  'cancellation_intent_missing',
  'active_remote_session',
  'active_local_process',
  'untrusted_acceptance',
  'acceptance_not_established',
  'acceptance_identity_mismatch',
  'accepted_identity_missing',
  'block_reason_missing',
] as const;
export type TransitionError = (typeof TRANSITION_ERRORS)[number];

export type TransitionResult =
  | { ok: true; state: IncidentMachineState }
  | { ok: false; error: TransitionError; message: string };

const fail = (error: TransitionError, message: string): TransitionResult => ({ ok: false, error, message });

/**
 * Pure transition guard. Beyond the canonical table:
 * - terminal states never resurrect;
 * - `blocked` resumes only to its recorded `fromStatus`, after a recorded resolution decision;
 * - after (sticky) cancellation intent, no forward progress, completion or publication;
 * - `cancel_pending`/`cancelled` require recorded cancellation intent;
 * - no terminal state unless remote sessions AND local processes are confirmed stopped (0).
 *   The canonical table has no `evaluating|accepted|releasing -> cancel_pending`; with live work
 *   those phases must route `-> blocked -> cancel_pending -> cancelled` (gap flagged in W01-HANDOFF.md);
 * - `-> accepted` requires a trusted `accepted` verdict whose identity equals `currentIdentity`;
 *   the identity is then carried and must equal `currentIdentity` for `releasing`/`completed`
 *   (and for resuming a block back into `accepted`).
 */
export function transitionIncident(
  state: IncidentMachineState,
  to: IncidentStatus,
  ctx: TransitionContext,
): TransitionResult {
  const from = state.status;
  if (isTerminal(from)) return fail('terminal_state', `${from} is terminal; a new incident must supersede it`);
  if (!INCIDENT_TRANSITIONS[from].includes(to)) return fail('illegal_transition', `${from} -> ${to} is not allowed`);

  if (from === 'blocked' && isActionable(to)) {
    if (!state.block || state.block.fromStatus !== to) {
      return fail('blocked_resume_mismatch', `blocked from ${state.block?.fromStatus ?? 'unrecorded phase'}, cannot resume to ${to}`);
    }
    if (!state.block.resolution) return fail('block_unresolved', 'blocking condition has no recorded resolution');
  }

  if (state.cancelRequested && (isActionable(to) || to === 'completed')) {
    return fail('cancellation_requested', `cancellation requested; ${to} is forward progress`);
  }
  if ((to === 'cancel_pending' || to === 'cancelled') && !state.cancelRequested) {
    return fail('cancellation_intent_missing', 'record cancellation intent before cancelling');
  }

  if (isTerminal(to)) {
    if (ctx.activeRemoteSessions !== 0) {
      return fail('active_remote_session', `${to} requires confirmed stop of remote sessions (active: ${ctx.activeRemoteSessions})`);
    }
    if (ctx.activeLocalProcesses !== 0) {
      return fail('active_local_process', `${to} requires confirmed stop of local processes (active: ${ctx.activeLocalProcesses})`);
    }
  }

  let acceptedIdentity = state.acceptedIdentity;
  if (to === 'accepted' && from === 'evaluating') {
    const verdict = ctx.acceptance;
    if (verdict === undefined) return fail('acceptance_not_established', 'no acceptance verdict');
    if (!isTrustedVerdict(verdict)) return fail('untrusted_acceptance', 'verdict was not produced by evaluateAcceptance');
    if (verdict.decision !== 'accepted') return fail('acceptance_not_established', `acceptance verdict: ${verdict.decision}`);
    if (!sameAcceptanceIdentity(verdict.identity, ctx.currentIdentity)) {
      return fail('acceptance_identity_mismatch', 'verdict is not for the current candidate/input/evaluator/profile');
    }
    acceptedIdentity = { ...verdict.identity! };
  } else if (to === 'accepted' || to === 'releasing' || to === 'completed') {
    if (!acceptedIdentity) return fail('accepted_identity_missing', `${to} requires a bound accepted identity`);
    if (!sameAcceptanceIdentity(acceptedIdentity, ctx.currentIdentity)) {
      return fail('acceptance_identity_mismatch', `${to}: current identity differs from the accepted one; re-evaluate`);
    }
  } else if (to === 'reproducing' || to === 'engineering' || to === 'evaluating') {
    // New work produces a new candidate; any earlier acceptance no longer applies.
    acceptedIdentity = null;
  }

  if (to === 'blocked') {
    if (!ctx.blockReason) return fail('block_reason_missing', 'blocking requires a reason');
    const fromStatus = from as BlockRecord['fromStatus'];
    return {
      ok: true,
      state: { ...state, status: to, acceptedIdentity, block: { fromStatus, reason: ctx.blockReason, blockedAt: ctx.now, resolution: null } },
    };
  }
  return { ok: true, state: { ...state, status: to, acceptedIdentity, block: null } };
}

/** Records the decision that resolved the current block. Does not change status. */
export function resolveBlock(state: IncidentMachineState, decisionId: string, at: string): IncidentMachineState {
  if (state.status !== 'blocked' || !state.block) throw new Error('resolveBlock: incident is not blocked');
  return { ...state, block: { ...state.block, resolution: { decisionId, resolvedAt: at } } };
}

/** Cancellation intent is persisted first; it is sticky. */
export function requestCancellation(state: IncidentMachineState): IncidentMachineState {
  if (isTerminal(state.status)) throw new Error('requestCancellation: incident is terminal');
  return { ...state, cancelRequested: true };
}
