// Protected controller-owned worker. Candidate code runs only in the offline container.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const plan = JSON.parse(readFileSync('/inputs/maintenance-plan.json', 'utf8'));
if (!Array.isArray(plan.tests) || !plan.tests.length || plan.tests.some(path =>
  typeof path !== 'string' || !/^tests\/[\w./-]+\.test\.[cm]?[jt]sx?$/.test(path) || path.split('/').includes('..'))) {
  throw Error('invalid_test_plan');
}
const results = [];
function infrastructureFailure(reason) {
  writeFileSync('/exports/maintenance.json', JSON.stringify({candidateSha:plan.candidateSha,tests:plan.tests,stages:results,infrastructureFailure:reason}));
  process.exit(78);
}
try {
  mkdirSync('/tmp/source');
  cpSync('/source/node_modules', '/tmp/source/node_modules', { recursive: true, verbatimSymlinks: true });
} catch {
  infrastructureFailure('workspace_preparation_failed');
}
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: '/tmp/source', stdio: 'inherit', timeout: 540000,
    // Bound esbuild/Go and Node helper threads within the container's 64-PID ceiling.
    env: { ...process.env, HOME: '/tmp', CI: 'true', TZ: 'UTC', UPDATE_GOLDEN: '0', GOMAXPROCS: '2', UV_THREADPOOL_SIZE: '2' },
  });
  if (result.error) {
    console.error('[maintenance] command could not finish:', result.error.code ?? 'execution_error');
    infrastructureFailure(result.error.code==='ETIMEDOUT'?'command_timeout':'command_unavailable');
  }
  if(result.signal)infrastructureFailure('command_signalled');
  return result.status ?? 1;
}
for (const archive of ['source.tar', 'baseline-tests.tar']) {
  const code = run('tar', ['-xf', `/inputs/${archive}`, '-C', '/tmp/source']);
  if (code !== 0) infrastructureFailure('archive_extraction_failed');
}
// Existing tests and configuration come from baseline; candidate-only tests remain available.
const stages = [
  { name: 'typecheck', args: ['exec', 'tsc', '--noEmit'] },
  { name: 'regressions', args: ['exec', 'vitest', 'run', ...plan.tests, '--maxWorkers=2'] },
];
for (const stage of stages) {
  console.log(`[maintenance] ${stage.name}`);
  const exitCode = run('pnpm', stage.args);
  results.push({ name: stage.name, exitCode });
  writeFileSync('/exports/maintenance.json', JSON.stringify({ candidateSha: plan.candidateSha, tests: plan.tests, stages: results }));
  if (exitCode !== 0) process.exit(exitCode);
}
