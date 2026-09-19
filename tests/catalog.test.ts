import { describe, expect, it } from 'vitest';
import rawCatalog from '../adapters/xarts/gate-catalog.json';
import { buildXartsGateProfile, XartsGateCatalog, xartsGateCatalog, type XartsProfileRequest } from '../adapters/xarts/catalog';
import { evaluateAcceptance, hashGateProfile } from '../contracts/gates';

const revision = 'a'.repeat(40);
const request = (): XartsProfileRequest => ({
  profileId: 'repair.xarts.v1', selectedCatalogIds: ['xarts.typecheck'], evaluatorRevision: revision,
  protectedGates: {
    semantic: { gateId: 'protected.meaning', gateVersion: 1, evaluatorRevision: revision },
    artifact: { gateId: 'protected.artifact', gateVersion: 2, evaluatorRevision: revision },
  },
});

describe('audited Xarts catalog', () => {
  it('preserves source inspection as not-run evidence', () => {
    expect(XartsGateCatalog.parse(xartsGateCatalog).entries.length).toBe(12);
    expect(xartsGateCatalog.entries.every(entry => entry.executionStatus === 'not_run')).toBe(true);
    expect(xartsGateCatalog.entries.filter(entry => entry.oracleIndependence === 'proven')).toEqual([]);
    const copy = structuredClone(xartsGateCatalog);
    (copy.entries[0] as { executionStatus: string }).executionStatus = 'pass';
    expect(XartsGateCatalog.safeParse(copy).success).toBe(false);
  });
  it('rejects duplicate identities and unjustified independent classifications', () => {
    expect(XartsGateCatalog.safeParse({ ...xartsGateCatalog, entries: [xartsGateCatalog.entries[0], xartsGateCatalog.entries[0]] }).success).toBe(false);
    expect(XartsGateCatalog.safeParse({ ...xartsGateCatalog, entries: [{ ...xartsGateCatalog.entries[0], classification: 'independent' }] }).success).toBe(false);
  });
  it.each([{ ids: [] }, { ids: ['unknown'] }, { ids: ['xarts.typecheck', 'xarts.typecheck'] }])('rejects invalid selection $ids', ({ ids: selectedCatalogIds }) => {
    expect(() => buildXartsGateProfile({ ...request(), selectedCatalogIds })).toThrow();
  });
  it('requires explicit protected semantic and artifact gates and matching evaluator identity', () => {
    const input = request();
    expect(() => buildXartsGateProfile({ ...input, protectedGates: undefined } as unknown as XartsProfileRequest)).toThrow();
    input.protectedGates.semantic.evaluatorRevision = 'b'.repeat(40);
    expect(() => buildXartsGateProfile(input)).toThrow(/revision mismatch/);
  });
  it('rejects reused or duplicate protected identities', () => {
    const input = request();
    input.protectedGates.semantic.gateId = 'xarts.golden';
    expect(() => buildXartsGateProfile(input)).toThrow();
    input.protectedGates.semantic.gateId = input.protectedGates.artifact.gateId;
    expect(() => buildXartsGateProfile(input)).toThrow();
  });
  it('binds executable catalog changes into the frozen profile identity', () => {
    const before = buildXartsGateProfile(request());
    const check = rawCatalog.entries.find(entry => entry.id === 'xarts.typecheck')!;
    const originalArgv = [...check.argv];
    try {
      check.argv.push('--changed-evaluator-option');
      const after = buildXartsGateProfile(request());
      expect(after.profileId).not.toBe(before.profileId);
      expect(hashGateProfile(after)).not.toBe(hashGateProfile(before));
      expect(after.gates).toEqual(before.gates);
    } finally {
      check.argv = originalArgv;
    }
    expect(buildXartsGateProfile(request())).toEqual(before);
  });
  it('makes selected checks mandatory while catalog success alone cannot accept repair', () => {
    const profile = buildXartsGateProfile(request());
    expect(profile.gates.every(gate => gate.requirement === 'required' && !gate.notApplicableAllowed)).toBe(true);
    const identity = { candidateSha: 'b'.repeat(40), evaluatorRevision: revision, inputHash: 'c'.repeat(64), acceptanceContractHash: hashGateProfile(profile) };
    const result = { schemaVersion: 1, id: 'catalog-pass', gateId: 'xarts.typecheck', gateVersion: 1,
      candidateSha: identity.candidateSha, evaluatorRevision: revision, inputHash: identity.inputHash,
      outcome: 'pass', reason: 'checks_passed', expected: null, actual: null, logArtifactId: 'fixture.log',
      durationMs: 1, runnerIdentity: 'fixture.runner', startedAt: '2026-01-01T00:00:00Z', finishedAt: '2026-01-01T00:00:00Z' };
    const verdict = evaluateAcceptance(profile, identity, [result]);
    expect(verdict.decision).toBe('incomplete');
    expect(verdict.accepted).toBe(false);
    expect(verdict.issues.some(issue => issue.gateId === 'protected.meaning')).toBe(true);
    expect(verdict.issues.some(issue => issue.gateId === 'protected.artifact')).toBe(true);
  });
});
