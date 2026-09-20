import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { ContainerRunner } from './container-runner';
import { ExecutionEvidence } from '../contracts/adapters';
const exec = promisify(execFile);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export const XARTS_NODE_IMAGE = 'node@sha256:4f77a690f2f8946ab16fe1e791a3ac0667ae1c3575c3e4d0d4589e9ed5bfaf3d';

/** Dependency preparation has network access but executes no repository lifecycle
 * scripts. Actual candidate commands run separately, offline, as an unprivileged user.
 * Only committed source enters the build context; no .env, Git config or host modules.
 */
const ARCHIVE_BASE = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'core', 'charts', 'lib', 'render-cli', 'fonts', 'packages', 'tests', 'addons', 'vendor', 'docs/SDK.md', 'LICENSE', 'LICENSE-COMMERCIAL.md'];

/** The SDK build snapshots every path the candidate's package.json publishes (`files`
 * and `exports` targets) plus the top-level docs/*.md it bundles as READMEs, so the
 * archive must carry them too; committed paths only. */
export async function archivePaths(git: (args: string[]) => Promise<string>, sha: string) {
  const pkg = JSON.parse(await git(['show', `${sha}:package.json`])) as { files?: unknown; exports?: unknown };
  const declared = [...ARCHIVE_BASE];
  if (Array.isArray(pkg.files)) for (const path of pkg.files) if (typeof path === 'string' && !path.startsWith('!')) declared.push(path);
  const exports = (value: unknown): void => {
    if (typeof value === 'string') declared.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(exports);
  };
  exports(pkg.exports);
  const patterns = declared.map(p => p.replace(/^\.\//, '').replace(/\/$/, ''))
    .filter(p => p && !p.split('/').includes('..') && !p.startsWith('/'));
  // Enumerate files, never directories: a declared directory must not smuggle
  // a nested credential, local database or symlink into the build context.
  const sensitive = /(^|\/)(?:\.env(?:[.-][^/]*)?|\.git|\.local|node_modules|\.npmrc|\.pnpmfile\.[^/]+|id_rsa|id_ed25519|credentials(?:\.[^/]+)?)(\/|$)|\.(?:pem|key|p12|sqlite|sqlite3|db)$/i;
  const matches = (file: string, pattern: string) => {
    if (!pattern.includes('*')) return file === pattern || file.startsWith(pattern + '/');
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*');
    return new RegExp('^' + escaped + '$').test(file);
  };
  const entries = (await git(['ls-tree', '-rz', sha])).split('\0').filter(Boolean);
  return entries.flatMap(entry => {
    const match = /^(\d+) \w+ [a-f0-9]+\t([\s\S]+)$/.exec(entry);
    if (!match || !['100644','100755'].includes(match[1])) return [];
    const file = match[2];
    if (sensitive.test(file)) return [];
    return /^docs\/[^/]+\.md$/.test(file) || patterns.some(p => matches(file, p)) ? [file] : [];
  }).sort();
}

export async function prepareXartsImage(checkout: string, sha: string, root: string) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('invalid_candidate_sha');
  await mkdir(root, { recursive: true });
  const git = async (args: string[]) => (await exec('git', args, { cwd: checkout, timeout:30000,killSignal:'SIGKILL', maxBuffer: 16 * 1024 * 1024 })).stdout;
  await exec('git', ['archive', '--format=tar', `--output=${join(root, 'source.tar')}`, sha, ...await archivePaths(git, sha)], { cwd: checkout, timeout:30000,killSignal:'SIGKILL' });
  for (const sibling of await readdir(dirname(root))) {
    try {
      const prior = JSON.parse(await readFile(join(dirname(root), sibling, 'identity.json'), 'utf8'));
      if (!/^[a-f0-9]{40}$/.test(prior.candidateSha) || !/^sha256:[a-f0-9]{64}$/.test(prior.image)) continue;
      await exec('git', ['diff', '--exit-code', prior.candidateSha, sha, '--', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'packages', 'vendor'], { cwd: checkout, timeout:10000,killSignal:'SIGKILL', maxBuffer: 1024 * 1024 });
      await exec('docker', ['image', 'inspect', prior.image], { timeout:10000,killSignal:'SIGKILL' });
      await writeFile(join(root, 'identity.json'), JSON.stringify({ candidateSha: sha, sourceHash: hash(await readFile(join(root, 'source.tar'))), image: prior.image, dependencySourceSha: prior.candidateSha }));
      return prior.image;
    } catch { /* A cache miss never supplies evidence or substitutes candidate source. */ }
  }
  await writeFile(join(root, 'Dockerfile'), `FROM ${XARTS_NODE_IMAGE}\nRUN npm install --global --ignore-scripts pnpm@10.33.0\nADD source.tar /source/\nWORKDIR /source\nRUN pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile\nRUN mkdir /exports && chmod 777 /exports\n`);
  const result = await exec('docker', ['build', '--progress', 'plain', '--iidfile', join(root, 'image.id'), root], { timeout:600000,killSignal:'SIGKILL', maxBuffer: 8 * 1024 * 1024 });
  await writeFile(join(root, 'preparation.log'), result.stdout + result.stderr);
  const image = (await readFile(join(root, 'image.id'), 'utf8')).trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw Error('invalid_image_identity');
  await writeFile(join(root, 'identity.json'), JSON.stringify({ candidateSha: sha, sourceHash: hash(await readFile(join(root, 'source.tar'))), image }));
  return image;
}

export async function validateXartsBuild(config: { root: string; image: string; candidateSha: string; evaluatorRevision: string }) {
  const artifacts = join(config.root, 'artifacts');
  await mkdir(artifacts, { recursive: true });
  const worker = await readFile(new URL('../adapters/xarts/build-worker.mjs', import.meta.url));
  const sha256 = hash(worker);
  await writeFile(join(artifacts, sha256), worker);
  const source = await readFile(join(config.root, 'source.tar'));
  const sourceHash = hash(source);
  await writeFile(join(artifacts, sourceHash), source);
  const argv = ['node', '/inputs/build-worker.mjs'];
  try {
    const previous = ExecutionEvidence.parse(JSON.parse(await readFile(join(config.root, 'build-evidence.json'), 'utf8')));
    const intent = JSON.parse(await readFile(join(config.root, 'runs', previous.runId, 'intent.json'), 'utf8'));
    const exactInputs = intent.inputs.candidateSha === config.candidateSha && intent.inputs.evaluatorRevision === config.evaluatorRevision &&
      intent.plan.runtimeImage === config.image && JSON.stringify(intent.plan.argv) === JSON.stringify(argv) &&
      intent.inputs.artifacts.some((a: {artifactId:string;sha256:string}) => a.artifactId === 'build-worker' && a.sha256 === sha256) &&
      intent.inputs.artifacts.some((a: {artifactId:string;sha256:string}) => a.artifactId === 'candidate-source' && a.sha256 === sourceHash);
    if (exactInputs && previous.outcome === 'completed' && previous.exitCode === 0 && previous.isolation === 'container') {
      for (const id of previous.artifactIds) {
        const sha = id.split(':').at(-1)!;
        if (!/^[a-f0-9]{64}$/.test(sha) || hash(await readFile(join(artifacts, sha))) !== sha) throw Error('cached_artifact_changed');
      }
      return previous;
    }
  } catch { /* Missing, stale or incomplete evidence is never promoted to a pass. */ }
  const runner = new ContainerRunner({ root: join(config.root, 'runs'), artifacts, commands: {
    'xarts-build': { argv, image: config.image, outputs: { package: '/exports/package.tgz', manifest: '/exports/build.json' } },
  } });
  const evidence = await runner.run({ planId: 'xarts-build-v1', commandId: 'xarts-build', argv, runtimeImage: config.image,
    mounts: [{ artifactId: 'build-worker', sha256, target: 'build-worker.mjs', readOnly: true },
      { artifactId: 'candidate-source', sha256: sourceHash, target: 'source.tar', readOnly: true }],
    ceilings: { wallMs: 600000, memoryMb: 3072, outputBytes: 4 * 1024 * 1024, artifactBytes: 1024 * 1024 * 1024 }, network: 'none',
  }, { candidateSha: config.candidateSha, evaluatorRevision: config.evaluatorRevision, artifacts: [{ artifactId: 'build-worker', sha256 }, { artifactId: 'candidate-source', sha256: sourceHash }] });
  await writeFile(join(config.root, 'build-evidence.json'), JSON.stringify(evidence, null, 2));
  return evidence;
}

export async function validateXartsConsumer(config: { root: string; packageBytes: Buffer; request: { spec: Record<string,unknown>; rows: unknown[]; dataHash: string }; candidateSha: string; evaluatorRevision: string; checkout: string; baselineSha: string }) {
  const root = join(config.root, 'consumer');
  const artifacts = join(config.root, 'artifacts');
  await mkdir(root, { recursive: true });
  await mkdir(artifacts, { recursive: true });
  await writeFile(join(root, 'package.tgz'), config.packageBytes);
  // The candidate cannot change this protected consumer test.
  if (!/^[a-f0-9]{40}$/.test(config.baselineSha)) throw Error('invalid_baseline_sha');
  const test = await exec('git', ['show', `${config.baselineSha}:tests/consumer/sdk/node.mjs`], { cwd: config.checkout, timeout:10000,killSignal:'SIGKILL', maxBuffer: 1024 * 1024 });
  await writeFile(join(root, 'standalone.mjs'), test.stdout);
  await writeFile(join(root, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: { 'visx-render': 'file:/package.tgz', react: '18.3.1', 'react-dom': '18.3.1' } }));
  await writeFile(join(root, 'Dockerfile'), `FROM ${XARTS_NODE_IMAGE}\nCOPY package.tgz /package.tgz\nWORKDIR /consumer\nCOPY package.json standalone.mjs ./\nRUN npm install --ignore-scripts --no-audit --no-fund\nRUN mkdir /exports && chmod 777 /exports\n`);
  const preparation = await exec('docker', ['build', '--progress', 'plain', '--iidfile', join(root, 'image.id'), root], { timeout:600000,killSignal:'SIGKILL', maxBuffer: 8 * 1024 * 1024 });
  await writeFile(join(root, 'preparation.log'), preparation.stdout + preparation.stderr);
  const image = (await readFile(join(root, 'image.id'), 'utf8')).trim();
  const files = [
    ['consumer-worker.mjs', await readFile(new URL('../adapters/xarts/consumer-worker.mjs', import.meta.url))],
    ['request.json', Buffer.from(JSON.stringify(config.request))],
  ] as const;
  const mounts = [];
  for (const [target, bytes] of files) {
    const sha256 = hash(bytes);await writeFile(join(artifacts, sha256), bytes);
    mounts.push({ artifactId: target, sha256, target, readOnly: true });
  }
  const argv = ['node', '/inputs/consumer-worker.mjs'];
  const runner = new ContainerRunner({ root: join(root, 'runs'), artifacts, commands: {
    consumer: { argv, image, outputs: { svg: '/exports/chart.svg', report: '/exports/consumer.json' } },
  } });
  return runner.run({ planId: 'xarts-consumer-v1', commandId: 'consumer', argv, runtimeImage: image, mounts,
    ceilings: { wallMs: 180000, memoryMb: 2048, outputBytes: 4 * 1024 * 1024, artifactBytes: 64 * 1024 * 1024 }, network: 'none',
  }, { candidateSha: config.candidateSha, evaluatorRevision: config.evaluatorRevision, artifacts: mounts.map(({ artifactId, sha256 }) => ({ artifactId, sha256 })) });
}
