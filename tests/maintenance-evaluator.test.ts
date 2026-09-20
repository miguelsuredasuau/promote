import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const mocks = vi.hoisted(() => ({ git: vi.fn(), run: vi.fn(), prepare: vi.fn(), archive: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: (_command: string, args: string[], options: unknown, callback: Function) => {
  Promise.resolve().then(() => mocks.git(args, options)).then(value => callback(null, { stdout: value, stderr: '' }), error => callback(error));
} }));
// promisify normally recognizes execFile's custom return shape; our fake directly supplies it.
vi.mock('../server/xarts-validation', () => ({ prepareXartsImage: mocks.prepare, archivePaths: mocks.archive }));
vi.mock('../server/container-runner', () => ({ ContainerRunner: class {
  constructor(private config: any) {}
  run(plan: any, inputs: any) { return mocks.run(plan, inputs, this.config); }
} }));
import { evaluateMaintenance } from '../server/maintenance-evaluator';

let root: string;
const base = 'a'.repeat(40), candidate = 'b'.repeat(40), digest = 'c'.repeat(64), reportDigest = 'd'.repeat(64);
const input = () => ({ root, checkout: '/fixture', repo: 'owner/library', baseSha: base, candidateSha: candidate,
  branch: 'promote/repair', allowedPaths: ['core', 'tests'], protectedPaths: ['core/security'], tests: ['tests/unit/example.test.ts'] });
beforeEach(async () => {
  vi.clearAllMocks(); root = await mkdtemp(join(tmpdir(), 'promote-maintenance-'));
  mocks.git.mockImplementation(async (args: string[]) => {
    if (args[0] === 'config') return 'https://github.com/owner/library.git';
    if (args[0] === 'ls-remote') return `${candidate}\trefs/heads/promote/repair`;
    if (args[0] === 'diff') return 'core/example.ts\0';
    if (args[0] === 'rev-parse') return base;
    if (args[0] === 'archive') await writeFile(args.find(arg => arg.startsWith('--output='))!.slice(9), 'baseline');
    return '';
  });
  mocks.archive.mockResolvedValue(['tests/unit/example.test.ts', 'vitest.config.ts', 'tsconfig.json', 'package.json']);
  mocks.prepare.mockImplementation(async (_checkout, _sha, dir) => { await writeFile(join(dir, 'source.tar'), 'source'); return `sha256:${digest}`; });
  mocks.run.mockImplementation(async (_plan, _inputs, config) => {
    await writeFile(join(config.artifacts, digest), 'test output');
    await writeFile(join(config.artifacts, reportDigest), JSON.stringify({ candidateSha: candidate, tests: input().tests,
      stages: [{ name: 'typecheck', exitCode: 0 }, { name: 'regressions', exitCode: 0 }] }));
    return { runId: 'run-1', planId: 'maintenance-v1', runnerIdentity: 'test', isolation: 'container', exitCode: 0,
      outcome: 'completed', durationMs: 10, artifactIds: [`log:${digest}`, `output:report:${reportDigest}`],
      startedAt: '2026-09-20T12:00:00Z', finishedAt: '2026-09-20T12:00:01Z' };
  });
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe('independent maintenance evaluation', () => {
  it('rejects unsafe selected test arguments before git or Docker', async () => {
    expect((await evaluateMaintenance({ ...input(), tests: ['--passWithNoTests'] })).reason).toBe('invalid_maintenance_plan');
    expect(mocks.git).not.toHaveBeenCalled();
  });
  it('does not evaluate a stale branch candidate', async () => {
    mocks.git.mockImplementation(async args => args[0] === 'config' ? 'https://github.com/owner/library.git' : `${base}\trefs/heads/promote/repair`);
    expect((await evaluateMaintenance(input())).reason).toBe('candidate_branch_mismatch');
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it.each(['package.json', 'packages/kit/package.json', 'core/security/guard.ts', 'other/file.ts'])('refuses protected or unapproved change %s', async path => {
    const original = mocks.git.getMockImplementation()!;
    mocks.git.mockImplementation((args, options) => args[0] === 'diff' ? `${path}\0` : original(args, options));
    expect((await evaluateMaintenance({ ...input(), allowedPaths: ['core', 'packages', 'package.json'] })).reason).toBe('candidate_scope_violation');
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it('binds baseline tests and candidate source to offline execution before accepting', async () => {
    expect((await evaluateMaintenance(input())).status).toBe('passed');
    const [plan, inputs] = mocks.run.mock.calls[0];
    expect(plan.network).toBe('none');
    expect(plan.argv).toEqual(['node', '/inputs/maintenance-worker.mjs']);
    expect(plan.mounts.map((mount: any) => mount.target)).toContain('baseline-tests.tar');
    expect(inputs.candidateSha).toBe(candidate);
    expect(mocks.git.mock.calls.some(([args]) => args[0] === 'archive' && args.includes(base))).toBe(true);
  });
  it('never accepts a nonzero result', async () => {
    const original = mocks.run.getMockImplementation()!;
    mocks.run.mockImplementation(async (...args) => ({ ...await original(...args), exitCode: 1 }));
    expect((await evaluateMaintenance(input())).status).toBe('failed');
  });
  it('blocks missing baseline runtime fixtures before candidate execution', async () => {
    const test='tests/unit/normaErrorBoundaries.test.ts';
    mocks.archive.mockResolvedValue([test,'vitest.config.ts','tsconfig.json','package.json']);
    expect((await evaluateMaintenance({...input(),tests:[test]})).reason).toBe('baseline_test_artifact_missing');
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it('blocks a committed baseline fixture omitted by controller archive policy', async () => {
    const test='tests/unit/normaErrorBoundaries.test.ts', fixture='docs/analysis/probes/symbolmap-external.mjs';
    const original=mocks.git.getMockImplementation()!;
    mocks.git.mockImplementation((args,options)=>args[0]==='ls-tree'?`${fixture}\0`:original(args,options));
    mocks.archive.mockResolvedValue([test,'vitest.config.ts','tsconfig.json','package.json']);
    expect((await evaluateMaintenance({...input(),tests:[test]})).reason).toBe('baseline_test_artifact_not_archived');
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it('restores required baseline fixtures alongside original tests', async () => {
    const test='tests/unit/normaErrorBoundaries.test.ts', fixture='docs/analysis/probes/symbolmap-external.mjs';
    const original=mocks.git.getMockImplementation()!;
    mocks.git.mockImplementation((args,options)=>args[0]==='ls-tree'?`${fixture}\0`:original(args,options));
    mocks.archive.mockResolvedValue([test,fixture,'vitest.config.ts','tsconfig.json','package.json']);
    await evaluateMaintenance({...input(),tests:[test]});
    expect(mocks.git.mock.calls.some(([args])=>args[0]==='archive'&&args.includes(base)&&args.includes(fixture))).toBe(true);
  });
  it.each(['workspace_preparation_failed','archive_extraction_failed','command_unavailable','command_timeout','command_signalled'])('holds structured worker %s instead of funding a candidate retry', async reason => {
    const original=mocks.run.getMockImplementation()!;
    mocks.run.mockImplementation(async (...args)=>{
      const evidence=await original(...args);
      await writeFile(join(args[2].artifacts,reportDigest),JSON.stringify({candidateSha:candidate,tests:input().tests,stages:[],infrastructureFailure:reason}));
      return {...evidence,exitCode:78};
    });
    expect(await evaluateMaintenance(input())).toMatchObject({status:'blocked',reason:`maintenance_${reason}`});
  });
  it('does not classify diagnostic strings in candidate logs as infrastructure evidence', async () => {
    const original=mocks.run.getMockImplementation()!;
    mocks.run.mockImplementation(async (...args)=>{
      const evidence=await original(...args);
      await writeFile(join(args[2].artifacts,digest),'command_unavailable Cannot find module docs/analysis/probes/symbolmap-external.mjs');
      return {...evidence,exitCode:1};
    });
    expect((await evaluateMaintenance(input())).status).toBe('failed');
  });
  it('preserves an actual failed check even if the report also claims an infrastructure fault', async () => {
    const original=mocks.run.getMockImplementation()!;
    mocks.run.mockImplementation(async (...args)=>{
      const evidence=await original(...args);
      await writeFile(join(args[2].artifacts,reportDigest),JSON.stringify({candidateSha:candidate,tests:input().tests,stages:[{name:'typecheck',exitCode:1}],infrastructureFailure:'command_unavailable'}));
      return {...evidence,exitCode:78};
    });
    expect((await evaluateMaintenance(input())).status).toBe('failed');
  });
  it('holds timeout evidence instead of treating missing checks as passes', async () => {
    const original = mocks.run.getMockImplementation()!;
    mocks.run.mockImplementation(async (...args) => ({ ...await original(...args), outcome: 'timeout' }));
    expect((await evaluateMaintenance(input())).status).toBe('blocked');
  });
});
