// Apply the immutable-evidence retention policy to candidate workspaces.
//   node --import tsx scripts/retain-evidence.ts --registry .local/registry [--older-than-days N] [--apply] [--reason "..."]
// Without --apply it only reports what each workspace would lose. The active
// release's workspace is always kept. Receipts, small logs and reports are never removed.
import { resolve, join } from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { expungeCandidateWorkspace, planExpunge, protectedCandidateShas, readExpungeReceipt } from '../server/retention';

const args = process.argv.slice(2);
const option = (name: string) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
const registry = resolve(option('--registry') ?? '.local/registry');
const olderThanDays = Number(option('--older-than-days') ?? 0);
const apply = args.includes('--apply');
const reason = option('--reason') ?? `retention sweep (older than ${olderThanDays} days)`;
const root = process.cwd();
const workspaces = join(root, '.local/xarts-validation');
const protectedShas = protectedCandidateShas(registry);
const cutoff = Date.now() - olderThanDays * 86_400_000;

for (const sha of readdirSync(workspaces).filter(name => /^[a-f0-9]{40}$/.test(name)).sort()) {
  const workspace = join(workspaces, sha);
  if (protectedShas.has(sha)) { console.log(`${sha} kept: active release`); continue; }
  if (statSync(workspace).mtimeMs > cutoff) { console.log(`${sha} kept: newer than ${olderThanDays} days`); continue; }
  const plan = planExpunge(workspace);
  if (plan.length === 0) { console.log(`${sha} nothing to expunge${readExpungeReceipt(workspace) ? ' (receipt present)' : ''}`); continue; }
  if (!apply) { console.log(`${sha} would expunge ${plan.length} payload files (dry run)`); continue; }
  const result = expungeCandidateWorkspace(root, sha, { registry, reason });
  console.log(`${sha} expunged ${result.expunged.length} files · ${result.expunged.reduce((n, f) => n + f.bytes, 0)} bytes · receipt ${join(result.workspace, 'expunged.json')}`);
}
