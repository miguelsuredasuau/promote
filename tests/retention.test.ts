import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { expungeCandidateWorkspace, expungedArtifact, planExpunge, readExpungeReceipt, PAYLOAD_ARTIFACT_LIMIT } from '../server/retention';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(r => rmSync(r, { recursive: true, force: true })));
const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

function workspace(candidateSha = 'a'.repeat(40)) {
  const root = mkdtempSync(join(tmpdir(), 'retention-')); roots.push(root);
  const dir = join(root, '.local/xarts-validation', candidateSha);
  const write = (path: string, bytes: string | Buffer) => { mkdirSync(join(dir, path, '..'), { recursive: true }); writeFileSync(join(dir, path), bytes); };
  write('identity.json', '{"candidateSha":"x"}'); write('build-evidence.json', '{}');
  write('source.tar', 'tar bytes'); write('runs/1/stdout.log', 'run log'); write('consumer/package.tgz', 'tgz');
  const log = 'gate log'; write(`artifacts/${sha256(log)}`, log);
  const big = Buffer.alloc(PAYLOAD_ARTIFACT_LIMIT + 1, 1); write(`artifacts/${sha256(big)}`, big);
  mkdirSync(join(root, 'registry/releases'), { recursive: true });
  return { root, dir, candidateSha, registry: join(root, 'registry'), log, big };
}

it('expunges payloads, keeps receipts and small logs, and records every removed hash before deleting', () => {
  const w = workspace();
  expect(planExpunge(w.dir)).toEqual([`artifacts/${sha256(w.big)}`, 'consumer/package.tgz', 'runs/1/stdout.log', 'source.tar']);
  const result = expungeCandidateWorkspace(w.root, w.candidateSha, { registry: w.registry, reason: 'test sweep' });
  expect(result.expunged).toContainEqual({ path: 'source.tar', sha256: sha256('tar bytes'), bytes: 9 });
  for (const kept of ['identity.json', 'build-evidence.json', `artifacts/${sha256(w.log)}`]) expect(existsSync(join(w.dir, kept))).toBe(true);
  for (const gone of ['source.tar', 'runs', 'consumer', `artifacts/${sha256(w.big)}`]) expect(existsSync(join(w.dir, gone))).toBe(false);
  const receipt = readExpungeReceipt(w.dir)!;
  expect(receipt.policy).toBe('immutable-evidence'); expect(receipt.entries).toHaveLength(1);
  expect(expungedArtifact(w.root, w.candidateSha, sha256(w.big))).toMatchObject({ sha256: sha256(w.big), bytes: PAYLOAD_ARTIFACT_LIMIT + 1 });
  expect(expungedArtifact(w.root, w.candidateSha, sha256(w.log))).toBeNull();
  const again = expungeCandidateWorkspace(w.root, w.candidateSha, { registry: w.registry, reason: 'again' });
  expect(again.expunged).toEqual([]); expect(readExpungeReceipt(w.dir)!.entries).toHaveLength(1);
});

it('never expunges the workspace behind the active release', () => {
  const w = workspace();
  writeFileSync(join(w.registry, 'active.json'), JSON.stringify({ schemaVersion: 1, releaseId: 'xarts-test', activatedAt: new Date().toISOString() }));
  writeFileSync(join(w.registry, 'releases/xarts-test.json'), JSON.stringify({ id: 'xarts-test', acceptedSha: w.candidateSha }));
  expect(() => expungeCandidateWorkspace(w.root, w.candidateSha, { registry: w.registry, reason: 'test' })).toThrow('active_release_protected');
  expect(existsSync(join(w.dir, 'source.tar'))).toBe(true);
  expect(() => expungeCandidateWorkspace(w.root, 'b'.repeat(40), { registry: w.registry, reason: 'test' })).toThrow('candidate_workspace_missing');
  expect(() => expungeCandidateWorkspace(w.root, '../x', { registry: w.registry, reason: 'test' })).toThrow('invalid_candidate_sha');
});

it('refuses while a release is being published and releases the lock afterwards', () => {
  const w = workspace();
  mkdirSync(join(w.registry, '.release-lock'));
  expect(() => expungeCandidateWorkspace(w.root, w.candidateSha, { registry: w.registry, reason: 'test' })).toThrow('registry_busy');
  expect(existsSync(join(w.dir, 'source.tar'))).toBe(true);
  rmSync(join(w.registry, '.release-lock'), { recursive: true });
  expect(expungeCandidateWorkspace(w.root, w.candidateSha, { registry: w.registry, reason: 'test' }).expunged.length).toBeGreaterThan(0);
  expect(existsSync(join(w.registry, '.release-lock'))).toBe(false);
});

it('a second sweep appends to the receipt instead of rewriting history', () => {
  const w = workspace();
  const first = expungeCandidateWorkspace(w.root, w.candidateSha, { registry: w.registry, reason: 'first', now: () => new Date('2026-01-01T00:00:00Z') });
  writeFileSync(join(w.dir, 'source.tar'), 'late payload');
  const second = expungeCandidateWorkspace(w.root, w.candidateSha, { registry: w.registry, reason: 'second', now: () => new Date('2026-02-01T00:00:00Z') });
  const receipt = JSON.parse(readFileSync(join(w.dir, 'expunged.json'), 'utf8'));
  expect(receipt.entries.map((e: { reason: string }) => e.reason)).toEqual(['first', 'second']);
  expect(first.expunged).toHaveLength(4); expect(second.expunged).toEqual([{ path: 'source.tar', sha256: sha256('late payload'), bytes: 12 }]);
});
