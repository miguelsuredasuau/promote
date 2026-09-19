// Trusted controller-owned entrypoint, executed only inside the offline container.
import { cpSync, readFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if (existsSync('/inputs/source.tar')) {
  mkdirSync('/tmp/source');
  cpSync('/source/node_modules', '/tmp/source/node_modules', { recursive: true, verbatimSymlinks: true });
  const unpack = spawnSync('tar', ['-xf', '/inputs/source.tar', '-C', '/tmp/source'], { stdio: 'inherit' });
  if (unpack.status !== 0) process.exit(1);
} else cpSync('/source', '/tmp/source', { recursive: true, verbatimSymlinks: true });
const commands = [
  ['node', ['--test', 'tests/sdk/compiler.test.mjs']],
  ['node', ['render-cli/build-sdk.mjs', '--out', 'out-promote']],
];
for (const [command, args] of commands) {
  const result = spawnSync(command, args, { cwd: '/tmp/source', stdio: 'inherit', env: { ...process.env, HOME: '/tmp' } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const build = JSON.parse(readFileSync('/tmp/source/out-promote/build.json', 'utf8'));
if (!/^[A-Za-z0-9._-]+\.tgz$/.test(build.tarball)) throw Error('invalid_tarball_name');
copyFileSync(`/tmp/source/out-promote/${build.tarball}`, '/exports/package.tgz');
copyFileSync('/tmp/source/out-promote/build.json', '/exports/build.json');
