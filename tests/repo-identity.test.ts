import { afterAll, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { configuredOrigin, originMatchesRepo } from '../server/repo-identity';

const roots: string[] = [];
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); });

function checkout(origin: string) {
  const root = mkdtempSync(join(tmpdir(), 'repo-identity-'));
  roots.push(root);
  const run = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  run(['init']);
  run(['remote', 'add', 'origin', origin]);
  // A transport rewrite (credential proxy, mirror) local to this checkout.
  run(['config', 'url.https://proxy.example.test/github.com/.insteadOf', 'https://github.com/']);
  const git = async (args: string[]) => run(args);
  return { git, run };
}

test('the configured origin identifies the repository even under an insteadOf transport rewrite', async () => {
  const { git, run } = checkout('https://github.com/fixture/library.git');
  // Whatever rewrite applies (the fixture's, or a global one on this host), the transport URL differs.
  expect(run(['remote', 'get-url', 'origin'])).not.toBe('https://github.com/fixture/library.git');
  expect(await configuredOrigin(git)).toBe('https://github.com/fixture/library.git');
  expect(await originMatchesRepo(git, 'fixture/library')).toBe(true);
});

test('a checkout configured for another repository is rejected', async () => {
  const { git } = checkout('https://github.com/fixture/other.git');
  expect(await originMatchesRepo(git, 'fixture/library')).toBe(false);
});

test('the ssh form is accepted', async () => {
  const { git } = checkout('git@github.com:fixture/library.git');
  expect(await originMatchesRepo(git, 'fixture/library')).toBe(true);
});
