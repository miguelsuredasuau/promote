import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { ContainerRunner } from './container-runner';
import { archivePaths, prepareXartsImage } from './xarts-validation';
import { originMatchesRepo } from './repo-identity';
import type { ExecutionEvidence } from '../contracts/adapters';

const exec = promisify(execFile);
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const relativePath = z.string().regex(/^[\w./-]+$/).refine(value => !value.startsWith('/') && !value.split('/').some(p => p === '..' || p === '.' || !p));
const Input = z.object({
  root: z.string().min(1), checkout: z.string().min(1), repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  baseSha: sha, candidateSha: sha, branch: z.string().regex(/^[\w/-][\w./-]*$/).refine(value => !value.includes('..')),
  allowedPaths: z.array(relativePath).min(1), protectedPaths: z.array(relativePath),
  tests: z.array(relativePath.refine(value => /^tests\/.*\.test\.[cm]?[jt]sx?$/.test(value))).min(1).max(100),
}).strict();
type MaintenanceInput = z.infer<typeof Input>;
export type MaintenanceResult = {
  status: 'passed' | 'failed' | 'blocked'; reason: string; candidateSha: string; changedPaths: string[];
  evidence?: ExecutionEvidence; log?: string;
};
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const inside = (path: string, scopes: string[]) => scopes.some(scope => path === scope || path.startsWith(`${scope}/`));
const fixedPolicy = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'vitest.config.ts', 'vite.config.ts'];
// These baseline tests execute files by path, so imports alone cannot discover
// their required fixtures. Keep controller-owned requirements explicit.
const baselineTestArtifacts: Record<string, string[]> = {
  'tests/unit/normaErrorBoundaries.test.ts': ['docs/analysis/probes/symbolmap-external.mjs'],
};
const WorkerReport = z.object({
  candidateSha: sha, tests: z.array(relativePath),
  stages: z.array(z.object({name:z.enum(['typecheck','regressions']),exitCode:z.number().int()}).strict()),
  infrastructureFailure:z.enum(['workspace_preparation_failed','archive_extraction_failed','command_unavailable','command_timeout','command_signalled']).optional(),
}).strict();

/** Independently evaluate a scoped candidate; this function never merges or activates it. */
export async function evaluateMaintenance(raw: MaintenanceInput, onProgress?: (stage:string,label:string)=>void): Promise<MaintenanceResult> {
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { status: 'blocked', reason: 'invalid_maintenance_plan', candidateSha: '', changedPaths: [] };
  const input = parsed.data;
  const changedPaths: string[] = [];
  const blocked = (reason: string): MaintenanceResult => ({ status: 'blocked', reason, candidateSha: input.candidateSha, changedPaths });
  const git = async (args: string[]) => (await exec('git', args, { cwd: input.checkout, timeout: 30000, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024 })).stdout.trim();
  try {
    onProgress?.('identity','Checking candidate identity and authorized files');
    if (!await originMatchesRepo(git, input.repo)) return blocked('repository_identity_mismatch');
    await git(['check-ref-format', `refs/heads/${input.branch}`]);
    const remote = await git(['ls-remote', '--exit-code', 'origin', `refs/heads/${input.branch}`]);
    if (remote.split(/\s+/)[0] !== input.candidateSha) return blocked('candidate_branch_mismatch');
    await git(['fetch', '--no-tags', 'origin', `refs/heads/${input.branch}`]);
    await git(['merge-base', '--is-ancestor', input.baseSha, input.candidateSha]);
    changedPaths.push(...(await git(['diff', '--name-only', '--no-renames', '-z', input.baseSha, input.candidateSha])).split('\0').filter(Boolean));
    if (!changedPaths.length) return blocked('empty_candidate_diff');
    if (changedPaths.some(path => !inside(path, input.allowedPaths) || inside(path, input.protectedPaths)
      || fixedPolicy.includes(path) || /(^|\/)(?:package\.json|pnpm-lock\.yaml|\.npmrc|\.pnpmfile\.[^/]+)$/.test(path))) return blocked('candidate_scope_violation');

    onProgress?.('preparing','Preparing isolated verification');
    const candidateFiles = await archivePaths(git, input.candidateSha);
    if (input.tests.some(path => !candidateFiles.includes(path))) return blocked('test_not_in_candidate_archive');
    const baselineFiles = (await archivePaths(git, input.baseSha)).filter(path => path.startsWith('tests/') || fixedPolicy.includes(path));
    if (!baselineFiles.includes('vitest.config.ts') || !baselineFiles.includes('tsconfig.json')) return blocked('baseline_test_configuration_missing');
    const requiredArtifacts = [...new Set(input.tests.flatMap(test => baselineTestArtifacts[test] ?? []))];
    if (requiredArtifacts.length) {
      const baselineTree=(await git(['ls-tree','-r','--name-only','-z',input.baseSha])).split('\0');
      if(requiredArtifacts.some(path=>!baselineTree.includes(path)))return blocked('baseline_test_artifact_missing');
      const baselineArchive=await archivePaths(git,input.baseSha);
      if(requiredArtifacts.some(path=>!baselineArchive.includes(path)))return blocked('baseline_test_artifact_not_archived');
      baselineFiles.push(...requiredArtifacts);
    }
    const root = join(input.root, '.local', 'maintenance-validation', `${input.candidateSha}-${randomUUID()}`);
    const artifacts = join(root, 'artifacts');
    await mkdir(artifacts, { recursive: true });
    const image = await prepareXartsImage(input.checkout, input.candidateSha, root);
    await exec('git', ['archive', '--format=tar', `--output=${join(root, 'baseline-tests.tar')}`, input.baseSha, '--', ...baselineFiles], {
      cwd: input.checkout, env: { ...process.env, GIT_LITERAL_PATHSPECS: '1' }, timeout: 30000, killSignal: 'SIGKILL',
    });
    const files: [string, Buffer][] = [
      ['maintenance-worker.mjs', await readFile(new URL('../adapters/xarts/maintenance-worker.mjs', import.meta.url))],
      ['maintenance-plan.json', Buffer.from(JSON.stringify({ candidateSha: input.candidateSha, tests: input.tests }))],
      ['source.tar', await readFile(join(root, 'source.tar'))],
      ['baseline-tests.tar', await readFile(join(root, 'baseline-tests.tar'))],
      ['evaluator.ts', await readFile(new URL('./maintenance-evaluator.ts', import.meta.url))],
    ];
    const mounts = [];
    for (const [target, bytes] of files) {
      const sha256 = hash(bytes); await writeFile(join(artifacts, sha256), bytes);
      mounts.push({ artifactId: target, sha256, target, readOnly: true as const });
    }
    const evaluatorRevision = (await exec('git', ['rev-parse', 'HEAD'], { cwd: input.root, timeout: 10000 })).stdout.trim();
    const argv = ['node', '/inputs/maintenance-worker.mjs'];
    const runner = new ContainerRunner({ root: join(root, 'runs'), artifacts, commands: {
      maintenance: { argv, image, outputs: { report: '/exports/maintenance.json' } },
    } });
    let stageOutput='';
    const evidence = await runner.run({ planId: 'maintenance-v1', commandId: 'maintenance', argv, runtimeImage: image, mounts,
      ceilings: { wallMs: 600000, memoryMb: 4096, outputBytes: 4 * 1024 * 1024, artifactBytes: 1024 * 1024 * 1024 }, network: 'none',
    }, { candidateSha: input.candidateSha, evaluatorRevision, artifacts: mounts.map(({ artifactId, sha256 }) => ({ artifactId, sha256 })) }, chunk=>{stageOutput=(stageOutput+chunk).slice(-2000);if(stageOutput.includes('[maintenance] regressions')){onProgress?.('regressions','Running behavioral regression tests');stageOutput='';}else if(stageOutput.includes('[maintenance] typecheck')){onProgress?.('typecheck','Checking TypeScript');stageOutput='';}});
    await writeFile(join(root, 'evidence.json'), JSON.stringify({ ...input, evidence }, null, 2));
    const logId = evidence.artifactIds.find(id => /^log:[a-f0-9]{64}$/.test(id));
    const log = logId ? (await readFile(join(artifacts, logId.slice(4)), 'utf8')).slice(-12000) : undefined;
    const reportId = evidence.artifactIds.find(id => /^output:report:[a-f0-9]{64}$/.test(id));
    if (evidence.isolation !== 'container' || evidence.outcome !== 'completed' || !logId) return { ...blocked('isolated_execution_incomplete'), evidence, log };
    const report = reportId ? WorkerReport.safeParse(JSON.parse(await readFile(join(artifacts, reportId.split(':').at(-1)!), 'utf8'))) : null;
    if(report?.success && report.data.candidateSha===input.candidateSha && JSON.stringify(report.data.tests)===JSON.stringify(input.tests)
      && report.data.infrastructureFailure && evidence.exitCode===78 && report.data.stages.every(stage=>stage.exitCode===0))
      return {...blocked(`maintenance_${report.data.infrastructureFailure}`),evidence,log};
    if (evidence.exitCode !== 0) return { status: 'failed', reason: 'maintenance_checks_failed', candidateSha: input.candidateSha, changedPaths, evidence, log };
    if (!reportId) return { ...blocked('maintenance_report_missing'), evidence, log };
    if (!report?.success || report.data.infrastructureFailure || report.data.candidateSha !== input.candidateSha || JSON.stringify(report.data.tests) !== JSON.stringify(input.tests)
      || JSON.stringify(report.data.stages) !== JSON.stringify([{ name: 'typecheck', exitCode: 0 }, { name: 'regressions', exitCode: 0 }])) return { ...blocked('maintenance_report_invalid'), evidence, log };
    return { status: 'passed', reason: 'independent_maintenance_checks_passed', candidateSha: input.candidateSha, changedPaths, evidence, log };
  } catch {
    return blocked('maintenance_validation_unavailable');
  }
}
