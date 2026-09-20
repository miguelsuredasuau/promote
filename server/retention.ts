import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, readlinkSync, statSync, writeFileSync, renameSync, rmSync, rmdirSync, lstatSync, mkdirSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { z } from 'zod';

/**
 * Retention policy: immutable evidence. A candidate workspace under
 * `.local/xarts-validation/<sha>` mixes two kinds of files. Receipts (identity,
 * build evidence, small content-addressed logs and reports) stay forever; bulky
 * payloads (source snapshot, container run directories, consumer images and
 * exported packages) may be expunged once the candidate is not the active release.
 * Expunging never deletes silently: every removed file leaves its path, SHA-256
 * and size in an append-only `expunged.json` receipt, so the evidence chain — the
 * hashes the incident events, gate results and release records already point at —
 * remains verifiable even when the bytes are gone.
 */
export const RETENTION_POLICY = 'immutable-evidence' as const;
export const PAYLOAD_ARTIFACT_LIMIT = 1024 * 1024;
const PAYLOAD_DIRS = ['source.tar', 'runs', 'consumer'];

export const ExpungedFile = z.object({ path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative() }).strict();
export const ExpungeReceipt = z.object({
  schemaVersion: z.literal(1), policy: z.literal(RETENTION_POLICY), candidateSha: z.string().regex(/^[a-f0-9]{40}$/),
  entries: z.array(z.object({ expungedAt: z.string().datetime(), reason: z.string().min(1), files: z.array(ExpungedFile) }).strict()),
}).strict();
export type ExpungeReceipt = z.infer<typeof ExpungeReceipt>;

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name);
  if (entry.isSymbolicLink()) return [path];
  return entry.isDirectory() ? walk(path) : [path];
});

export function readExpungeReceipt(workspace: string): ExpungeReceipt | null {
  const file = join(workspace, 'expunged.json');
  return existsSync(file) ? ExpungeReceipt.parse(JSON.parse(readFileSync(file, 'utf8'))) : null;
}

/** The sha of every release the registry still points at; those workspaces are never expunged. */
export function protectedCandidateShas(registry: string): Set<string> {
  const shas = new Set<string>();
  const activeFile = join(registry, 'active.json');
  if (!existsSync(activeFile)) return shas;
  const active = z.object({ releaseId: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/) }).passthrough().parse(JSON.parse(readFileSync(activeFile, 'utf8')));
  const release = z.object({ acceptedSha: z.string().regex(/^[a-f0-9]{40}$/) }).passthrough()
    .parse(JSON.parse(readFileSync(join(registry, 'releases', `${active.releaseId}.json`), 'utf8')));
  shas.add(release.acceptedSha);
  return shas;
}

/** Which files of a workspace the policy classifies as payload. Pure: nothing is removed. */
export function planExpunge(workspace: string) {
  const payload: string[] = [];
  for (const name of PAYLOAD_DIRS) {
    const path = join(workspace, name);
    if (!existsSync(path)) continue;
    if (lstatSync(path).isDirectory()) payload.push(...walk(path)); else payload.push(path);
  }
  const artifacts = join(workspace, 'artifacts');
  if (existsSync(artifacts)) for (const path of walk(artifacts)) if (lstatSync(path).isSymbolicLink() || statSync(path).size > PAYLOAD_ARTIFACT_LIMIT) payload.push(path);
  return payload.map(path => relative(workspace, path).split(sep).join('/')).sort();
}

const fsyncPath = (path: string) => { const fd = openSync(path, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } };

/** Same lock `publishLocalRelease` takes, so the active pointer cannot move while a workspace is judged and expunged. */
function withReleaseLock<T>(registry: string, work: () => T): T {
  mkdirSync(registry, { recursive: true });
  const lock = join(registry, '.release-lock');
  try { mkdirSync(lock); } catch { throw Error('registry_busy'); }
  try { return work(); } finally { rmdirSync(lock); }
}

export function expungeCandidateWorkspace(root: string, candidateSha: string, options: { registry: string; reason: string; now?: () => Date }) {
  if (!/^[a-f0-9]{40}$/.test(candidateSha)) throw Error('invalid_candidate_sha');
  const workspace = join(root, '.local/xarts-validation', candidateSha);
  if (!existsSync(workspace)) throw Error('candidate_workspace_missing');
  return withReleaseLock(options.registry, () => expungeLocked(workspace, candidateSha, options));
}

function expungeLocked(workspace: string, candidateSha: string, options: { registry: string; reason: string; now?: () => Date }) {
  if (protectedCandidateShas(options.registry).has(candidateSha)) throw Error('active_release_protected');
  const previous = readExpungeReceipt(workspace) ?? { schemaVersion: 1 as const, policy: RETENTION_POLICY, candidateSha, entries: [] };
  const files = planExpunge(workspace).map(path => {
    const absolute = join(workspace, path);
    if (lstatSync(absolute).isSymbolicLink()) return { path, sha256: createHash('sha256').update(readlinkSync(absolute)).digest('hex'), bytes: 0 };
    return { path, sha256: sha256(absolute), bytes: statSync(absolute).size };
  });
  if (files.length === 0) return { workspace, receipt: previous, expunged: [] as typeof files };
  const receipt: ExpungeReceipt = { ...previous, entries: [...previous.entries, { expungedAt: (options.now ?? (() => new Date()))().toISOString(), reason: options.reason, files }] };
  // The receipt is durable before any byte disappears: a crash leaves extra files, never unexplained gaps.
  const tmp = join(workspace, `expunged.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(receipt, null, 2)); fsyncPath(tmp);
  renameSync(tmp, join(workspace, 'expunged.json')); fsyncPath(workspace);
  for (const file of files) rmSync(join(workspace, file.path), { force: true });
  for (const name of PAYLOAD_DIRS) rmSync(join(workspace, name), { recursive: true, force: true });
  return { workspace, receipt, expunged: files };
}

/** Where an artifact's bytes went, for surfaces that serve content-addressed evidence. */
export function expungedArtifact(root: string, candidateSha: string, sha: string) {
  if (!/^[a-f0-9]{40}$/.test(candidateSha)) return null;
  const receipt = readExpungeReceipt(join(root, '.local/xarts-validation', candidateSha));
  const file = receipt?.entries.flatMap(e => e.files.map(f => ({ ...f, expungedAt: e.expungedAt }))).find(f => f.path === `artifacts/${sha}`);
  return file ?? null;
}
