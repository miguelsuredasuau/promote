import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { ControllerStore } from '../server/store';
import { isClerical, loadPullRequestConfig, mergePullRequest, resolveConflicts, type Fetch, type PullRequestConfig } from '../server/pull-requests';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const c of cleanups.splice(0)) c(); });

const sha = (c: string) => c.repeat(40);
const pull = (over: Record<string, unknown> = {}) => ({
  number: 7, title: 'Fix', html_url: 'https://github.com/o/r/pull/7', draft: false, user: { login: 'me' },
  base: { ref: 'main', sha: sha('b'), repo: { full_name: 'o/r' } }, head: { ref: 'fix', sha: sha('a'), repo: { full_name: 'o/r' } },
  mergeable: true, mergeable_state: 'clean', ...over,
});
const config: PullRequestConfig = { token: 'tok', repos: ['o/r'], workRoot: '' };

function github(routes: Record<string, unknown>, calls: { url: string; init?: RequestInit }[] = []): Fetch {
  return async (url, init) => {
    calls.push({ url, init });
    const path = url.replace('https://api.github.com', '');
    const key = `${init?.method ?? 'GET'} ${path}`;
    if (!(key in routes)) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(routes[key]), { status: 200 });
  };
}

function store() {
  const dir = mkdtempSync(join(tmpdir(), 'promote-pr-'));
  const s = new ControllerStore(join(dir, 'store.sqlite'));
  cleanups.push(() => { s.close(); rmSync(dir, { recursive: true, force: true }); });
  return s;
}

describe('configuration', () => {
  it('needs both a token and an explicit repository allowlist', () => {
    expect(loadPullRequestConfig('/x', {})).toBeNull();
    expect(loadPullRequestConfig('/x', { PROMOTE_GITHUB_TOKEN: 't' })).toBeNull();
    expect(loadPullRequestConfig('/x', { PROMOTE_GITHUB_TOKEN: 't', PROMOTE_MERGE_REPOS: 'bad repo' })).toBeNull();
    expect(loadPullRequestConfig('/x', { PROMOTE_GITHUB_TOKEN: 't', PROMOTE_MERGE_REPOS: 'o/r, o/s' })).toMatchObject({ repos: ['o/r', 'o/s'] });
  });
  it('never treats lockfiles, snapshots, goldens or schemas as disposable', () => {
    for (const f of ['pnpm-lock.yaml', 'tests/unit/__snapshots__/x.test.ts.snap', 'tests/__golden__/bar.svg', 'docs/chartspec.schema.json']) expect(isClerical(f)).toBe(false);
    for (const f of ['server/store.ts', 'charts/Bar/Bar.tsx', 'README.md', 'snap.ts']) expect(isClerical(f)).toBe(false);
  });
});

describe('mergePullRequest', () => {
  it('merges a green, up-to-date pull request at the exact reviewed head', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = github({
      'GET /repos/o/r/pulls/7': pull(),
      [`GET /repos/o/r/commits/${sha('a')}/check-runs?per_page=100`]: { check_runs: [{ name: 'ci', status: 'completed', conclusion: 'success', html_url: null }] },
      [`GET /repos/o/r/commits/${sha('a')}/status`]: { statuses: [] },
      'PUT /repos/o/r/pulls/7/merge': { merged: true, sha: sha('c') },
    }, calls);
    const s = store();
    const out = await mergePullRequest(config, s, { repo: 'o/r', number: 7, headSha: sha('a') }, { fetchImpl });
    expect(out).toEqual({ state: 'merged', sha: sha('c') });
    const merge = calls.find(c => c.init?.method === 'PUT')!;
    expect(JSON.parse(merge.init!.body as string)).toEqual({ sha: sha('a'), merge_method: 'merge' });
    expect(s.activity().some(e => e.category === 'pull-request' && e.summary === 'o/r#7: merged')).toBe(true);
  });

  it('refuses when QA failed, is pending, or the head moved since review', async () => {
    const s = store();
    const at = (checks: unknown[], headSha = sha('a')) => github({
      'GET /repos/o/r/pulls/7': pull(),
      [`GET /repos/o/r/commits/${sha('a')}/check-runs?per_page=100`]: { check_runs: checks },
      [`GET /repos/o/r/commits/${sha('a')}/status`]: { statuses: [] },
      'PUT /repos/o/r/pulls/7/merge': { merged: true, sha: sha('c') },
    });
    const input = (headSha = sha('a')) => ({ repo: 'o/r', number: 7, headSha });
    expect(await mergePullRequest(config, s, input(), { fetchImpl: at([{ name: 'ci', status: 'completed', conclusion: 'failure', html_url: null }]) })).toMatchObject({ state: 'refused', reason: 'qa_failed' });
    expect(await mergePullRequest(config, s, input(), { fetchImpl: at([{ name: 'ci', status: 'in_progress', conclusion: null, html_url: null }]) })).toMatchObject({ state: 'refused', reason: 'qa_pending' });
    expect(await mergePullRequest(config, s, input(sha('9')), { fetchImpl: at([]) })).toMatchObject({ state: 'refused', reason: 'pr_changed' });
    expect(await mergePullRequest(config, s, { repo: 'o/other', number: 7, headSha: sha('a') }, { fetchImpl: at([]) })).toMatchObject({ state: 'refused', reason: 'repo_not_allowed' });
    expect(await mergePullRequest(config, s, input(), { fetchImpl: github({ 'GET /repos/o/r/pulls/7': pull({ draft: true }), [`GET /repos/o/r/commits/${sha('a')}/check-runs?per_page=100`]: { check_runs: [] }, [`GET /repos/o/r/commits/${sha('a')}/status`]: { statuses: [] } }) })).toMatchObject({ state: 'refused', reason: 'not_mergeable' });
  });
});

describe('resolveConflicts', () => {
  function repos() {
    const dir = mkdtempSync(join(tmpdir(), 'promote-merge-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const remote = join(dir, 'remote.git'), work = join(dir, 'work');
    const git = (args: string[], cwd = work) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
    execFileSync('git', ['init', '--bare', '-q', '-b', 'main', remote]);
    execFileSync('git', ['clone', '-q', remote, work]);
    writeFileSync(join(work, 'src.ts'), 'a\nb\nc\n');
    writeFileSync(join(work, 'pnpm-lock.yaml'), 'lock v1\n');
    git(['add', '.']); git(['commit', '-q', '-m', 'base']); git(['push', '-q', 'origin', 'HEAD:main']);
    git(['checkout', '-q', '-b', 'fix']);
    return { remote, work, git };
  }
  /** Rewrite the GitHub URL to the local bare remote; everything else is real git. */
  const runFor = (remote: string) => async (file: string, args: string[], options: { cwd: string; env?: Record<string, string> }) => ({
    stdout: execFileSync(file, args.map(a => a.startsWith('https://github.com/') ? remote : a), { cwd: options.cwd, encoding: 'utf8', env: { ...process.env, ...options.env }, stdio: ['ignore', 'pipe', 'ignore'] }),
  });
  const viewFor = (git: (a: string[]) => string, remote: string) => ({
    repo: 'o/r', number: 1, title: 't', url: '', author: 'me', base: 'main', head: 'fix', headSha: git(['rev-parse', 'HEAD']), draft: false,
    mergeable: 'conflicts' as const, qa: 'passed' as const, checks: [], canMerge: true, reason: '', workRoot: join(remote, '..', 'merges'),
  });

  it('refuses conflicting lockfiles and preserves both branches', async () => {
    const { remote, work, git } = repos();
    writeFileSync(join(work, 'pnpm-lock.yaml'), 'lock from fix\n'); writeFileSync(join(work, 'feature.ts'), 'f\n');
    git(['add', '.']); git(['commit', '-q', '-m', 'fix']); git(['push', '-q', 'origin', 'fix']);
    git(['checkout', '-q', 'main']); writeFileSync(join(work, 'pnpm-lock.yaml'), 'lock from main\n'); git(['commit', '-q', '-am', 'main lock']); git(['push', '-q', 'origin', 'main']);
    const mainSha = git(['rev-parse', 'HEAD']); git(['checkout', '-q', 'fix']);
    const { workRoot, ...view } = viewFor(git, remote);
    const out = await resolveConflicts({ ...config, workRoot }, view, runFor(remote));
    expect(out).toMatchObject({ state: 'conflicts_need_owner', files: ['pnpm-lock.yaml'] });
    expect(git(['rev-parse', 'origin/main'], work) === mainSha || git(['ls-remote', remote, 'main']).startsWith(mainSha)).toBe(true);
    git(['pull', '-q', 'origin', 'fix']);
    expect(readFileSync(join(work, 'pnpm-lock.yaml'), 'utf8')).toBe('lock from fix\n');
    expect(readFileSync(join(work, 'feature.ts'), 'utf8')).toBe('f\n');
    expect(git(['rev-parse','HEAD'])).toBe(view.headSha);
  });

  it('aborts and names the files when source conflicts overlap', async () => {
    const { remote, work, git } = repos();
    writeFileSync(join(work, 'src.ts'), 'a\nFIX\nc\n'); git(['commit', '-q', '-am', 'fix']); git(['push', '-q', 'origin', 'fix']);
    git(['checkout', '-q', 'main']); writeFileSync(join(work, 'src.ts'), 'a\nMAIN\nc\n'); git(['commit', '-q', '-am', 'main']); git(['push', '-q', 'origin', 'main']);
    git(['checkout', '-q', 'fix']); const before = git(['ls-remote', remote, 'fix']);
    const { workRoot, ...view } = viewFor(git, remote);
    const out = await resolveConflicts({ ...config, workRoot }, view, runFor(remote));
    expect(out).toEqual({ state: 'conflicts_need_owner', files: ['src.ts'], detail: expect.stringContaining('1 file(s)') });
    expect(git(['ls-remote', remote, 'fix'])).toBe(before);
  });

  it('refuses if the branch moved between review and resolution', async () => {
    const { remote, work, git } = repos();
    writeFileSync(join(work, 'feature.ts'), 'f\n'); git(['add', '.']); git(['commit', '-q', '-m', 'fix']); git(['push', '-q', 'origin', 'fix']);
    const { workRoot, ...view } = viewFor(git, remote);
    writeFileSync(join(work, 'feature.ts'), 'g\n'); git(['commit', '-q', '-am', 'more']); git(['push', '-q', 'origin', 'fix']);
    expect(await resolveConflicts({ ...config, workRoot }, view, runFor(remote))).toMatchObject({ state: 'refused', reason: 'pr_changed' });
  });
});

it.each(['skipped','neutral',null])('does not merge when checks did not execute successfully: %s',async conclusion=>{
 const calls:{url:string;init?:RequestInit}[]=[];
 const fetchImpl=github({'GET /repos/o/r/pulls/7':pull(),[`GET /repos/o/r/commits/${sha('a')}/check-runs?per_page=100`]:{check_runs:[{name:'ci',status:'completed',conclusion,html_url:null}]},[`GET /repos/o/r/commits/${sha('a')}/status`]:{statuses:[]}},calls);
 expect(await mergePullRequest(config,store(),{repo:'o/r',number:7,headSha:sha('a')},{fetchImpl})).toMatchObject({state:'refused'});
 expect(calls.some(c=>c.init?.method==='PUT')).toBe(false);
});
it('refuses a clean PR with no checks',async()=>{
 const fetchImpl=github({'GET /repos/o/r/pulls/7':pull(),[`GET /repos/o/r/commits/${sha('a')}/check-runs?per_page=100`]:{check_runs:[]},[`GET /repos/o/r/commits/${sha('a')}/status`]:{statuses:[]}});
 expect(await mergePullRequest(config,store(),{repo:'o/r',number:7,headSha:sha('a')},{fetchImpl})).toMatchObject({state:'refused'});
});
