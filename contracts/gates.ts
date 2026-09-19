// SERVER-ONLY: authoritative gate-profile acceptance. Not re-exported by ./browser.
import { hashCanonical } from './hash';
import {
  ACCEPTANCE_EVIDENCE_CODES,
  GateProfile,
  type AcceptanceDecision,
  type AcceptanceIssue,
  type AcceptanceIssueCode,
  type AcceptanceVerdict,
} from './profile';
import { AcceptanceIdentity, GateResult, type GateResult as GateResultT } from './records';

export const hashGateProfile = (profile: GateProfile): string => hashCanonical(profile);

// Verdicts minted by evaluateAcceptance in this process. A structurally identical
// object (e.g. deserialized from a client or copied) is not authority.
const minted = new WeakSet<object>();
export const isTrustedVerdict = (v: unknown): v is AcceptanceVerdict => typeof v === 'object' && v !== null && minted.has(v);

/**
 * Deterministic, pure gate-profile acceptance. Fails closed: anything not
 * affirmatively proven for the exact candidate/evaluator/input/profile identity blocks.
 * The returned verdict is deeply frozen and recognised by isTrustedVerdict.
 */
export function evaluateAcceptance(
  profileInput: unknown,
  identityInput: unknown,
  resultsInput: readonly unknown[],
): AcceptanceVerdict {
  const issues: AcceptanceIssue[] = [];
  const add = (code: AcceptanceIssueCode, gateId: string | null, resultId: string | null, detail: string, blocking = true) =>
    issues.push({ code, gateId, resultId, blocking, detail });

  const rawGates = (profileInput as { gates?: unknown } | null)?.gates;
  const rawRequired = Array.isArray(rawGates)
    ? rawGates.filter((g) => (g as { requirement?: unknown } | null)?.requirement === 'required')
    : [];
  if (rawRequired.length === 0) add('empty_required_gates', null, null, 'no required gates: nothing can authorize release');

  const identityParsed = AcceptanceIdentity.safeParse(identityInput);
  if (!identityParsed.success) add('invalid_identity', null, null, 'acceptance identity is malformed');

  const profileParsed = GateProfile.safeParse(profileInput);
  if (!profileParsed.success) {
    if (rawRequired.length > 0) add('invalid_profile', null, null, 'gate profile failed schema validation');
    return finish(issues, [], identityParsed.success ? identityParsed.data : null);
  }
  if (!identityParsed.success) return finish(issues, [], null);

  const profile = profileParsed.data;
  const identity = identityParsed.data;
  if (hashGateProfile(profile) !== identity.acceptanceContractHash) {
    add('profile_hash_mismatch', null, null, 'profile is not the frozen acceptance contract of this incident');
  }
  if (profile.evaluatorRevision !== identity.evaluatorRevision) {
    add('profile_evaluator_mismatch', null, null, 'profile evaluator revision differs from incident');
  }

  const defs = new Map(profile.gates.map((g) => [g.gateId, g]));
  const byGate = new Map<string, GateResultT[]>();
  resultsInput.forEach((raw, index) => {
    const parsed = GateResult.safeParse(raw);
    if (!parsed.success) {
      const rid = (raw as { id?: unknown } | null)?.id;
      add('invalid_gate_result', null, typeof rid === 'string' ? rid : `#${index}`, 'gate result failed schema validation');
      return;
    }
    const r = parsed.data;
    const def = defs.get(r.gateId);
    if (!def) {
      add('unexpected_gate_result', r.gateId, r.id, 'gate not in frozen profile');
      return;
    }
    if (r.gateVersion !== def.gateVersion) add('gate_version_mismatch', r.gateId, r.id, `expected v${def.gateVersion}, got v${r.gateVersion}`);
    if (r.candidateSha !== identity.candidateSha) add('candidate_mismatch', r.gateId, r.id, 'result is for a different candidate');
    if (r.evaluatorRevision !== identity.evaluatorRevision) add('evaluator_mismatch', r.gateId, r.id, 'result from a different evaluator');
    if (r.inputHash !== identity.inputHash) add('input_mismatch', r.gateId, r.id, 'result for different inputs');
    byGate.set(r.gateId, [...(byGate.get(r.gateId) ?? []), r]);
  });

  const passed: string[] = [];
  for (const def of profile.gates) {
    const results = byGate.get(def.gateId) ?? [];
    if (results.length > 1) {
      const conflicting = new Set(results.map((r) => r.outcome)).size > 1;
      add(conflicting ? 'conflicting_gate_results' : 'duplicate_gate_result', def.gateId, null, `${results.length} results for one gate`);
      continue;
    }
    const r = results[0];
    if (def.requirement === 'supporting') {
      if (r && r.outcome !== 'pass' && r.outcome !== 'not_applicable') {
        add('supporting_gate_not_passed', def.gateId, r.id, `supporting gate ${r.outcome}: ${r.reason}`, false);
      }
      continue;
    }
    if (!r) {
      add('missing_required_result', def.gateId, null, 'required gate has no result');
      continue;
    }
    switch (r.outcome) {
      case 'pass':
        passed.push(def.gateId);
        break;
      case 'fail':
        add('gate_failed', def.gateId, r.id, r.reason);
        break;
      case 'error':
        add('gate_error', def.gateId, r.id, r.reason);
        break;
      case 'not_run':
        add('gate_not_run', def.gateId, r.id, r.reason);
        break;
      case 'not_applicable':
        if (def.notApplicableAllowed) passed.push(def.gateId);
        else add('not_applicable_disallowed', def.gateId, r.id, 'profile does not exclude this gate');
        break;
    }
  }
  return finish(issues, passed, identity);
}

function finish(issues: AcceptanceIssue[], passed: string[], identity: AcceptanceIdentity | null): AcceptanceVerdict {
  const sorted = [...issues].sort(
    (a, b) =>
      cmp(a.gateId ?? '', b.gateId ?? '') || cmp(a.code, b.code) || cmp(a.resultId ?? '', b.resultId ?? ''),
  );
  const blocking = sorted.filter((i) => i.blocking);
  const has = (codes: readonly string[]) => blocking.some((i) => codes.includes(i.code));
  const decision: AcceptanceDecision = has(ACCEPTANCE_EVIDENCE_CODES)
    ? 'invalid_evidence'
    : has(['gate_failed'])
      ? 'rejected'
      : blocking.length > 0
        ? 'incomplete'
        : 'accepted';
  const verdict: AcceptanceVerdict = Object.freeze({
    decision,
    accepted: decision === 'accepted',
    identity: identity && Object.freeze({ ...identity }),
    issues: Object.freeze(sorted.map((i) => Object.freeze(i))),
    passedRequiredGateIds: Object.freeze(decision === 'accepted' ? [...passed].sort(cmp) : []),
  });
  minted.add(verdict);
  return verdict;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
