import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { projectEnvironment } from './environment.mjs';
import type { ControllerStore } from './store';

const execFileAsync = promisify(execFile);
const REPO = /^[\w.-]+\/[\w.-]+$/;

export interface PullRequestConfig { token: string; repos: string[]; workRoot: string }

/** `PROMOTE_GITHUB_TOKEN` acts as the owner on GitHub; `PROMOTE_MERGE_REPOS` bounds where. */
export function loadPullRequestConfig(root: string, env: Record<string, string | undefined> = projectEnvironment(root)): PullRequestConfig | null {
  const token = env.PROMOTE_GITHUB_TOKEN?.trim();
  const repos = (env.PROMOTE_MERGE_REPOS ?? '').split(',').map(r => r.trim()).filter(Boolean);
  if (!token || !repos.length || repos.some(r => !REPO.test(r))) return null;
  return { token, repos, workRoot: join(root, '.local/merges') };
}

export type QaState = 'passed' | 'failed' | 'pending' | 'none';
export interface PullRequestView {
  repo: string; number: number; title: string; url: string; author: string;
  base: string; head: string; headSha: string; draft: boolean;
  mergeable: 'clean' | 'conflicts' | 'unknown' | 'blocked';
  qa: QaState; checks: { name: string; state: QaState; url: string | null }[];
  canMerge: boolean; reason: string;
}

export const MergeInput = z.object({
  repo: z.string().regex(REPO),
  number: z.number().int().positive(),
  headSha: z.string().regex(/^[a-f0-9]{40}$/),
}).strict();

export type MergeOutcome =
  | { state: 'merged'; sha: string }
  | { state: 'conflicts_resolved'; pushedSha: string; regenerated: string[]; detail: string }
  | { state: 'conflicts_need_owner'; files: string[]; detail: string }
  | { state: 'refused'; reason: string; detail: string };

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export type Run = (file: string, args: string[], options: { cwd: string; env?: Record<string, string> }) => Promise<{ stdout: string }>;

interface GitHubPull {
  number: number; title: string; html_url: string; draft: boolean;
  user: { login: string } | null;
  base: { ref: string; sha: string; repo: { full_name: string } };
  head: { ref: string; sha: string; repo: { full_name: string } | null };
  mergeable: boolean | null; mergeable_state: string;
}

/** Files whose merge conflicts are clerical: the base's version wins and the
 * branch's QA regenerates them. Anything else is a decision for the owner. */
// Lockfiles, schemas and golden images are acceptance inputs, not clerical files.
export const isClerical = (_path: string) => false;

const api = (config: PullRequestConfig, fetchImpl: Fetch) => async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetchImpl(`https://api.github.com${path}`, {
    ...init, redirect:'error', signal:AbortSignal.timeout(15000),
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${config.token}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'promote', ...(init.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`github_${response.status}:${path}`);
  return response.json() as Promise<T>;
};

/** Walks every page of a paginated endpoint; a partial view of QA is no view at all. */
async function allPages<T>(call: ReturnType<typeof api>, path: string, pick: (page: unknown) => T[], perPage = 100): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 50; page++) {
    const items = pick(await call<unknown>(`${path}${path.includes('?') ? '&' : '?'}per_page=${perPage}&page=${page}`));
    out.push(...items);
    if (items.length < perPage) return out;
  }
  throw new Error('github_pagination_exhausted');
}

function qaOf(checks: PullRequestView['checks']): QaState {
  if (!checks.length) return 'none';
  if (checks.some(c => c.state === 'failed')) return 'failed';
  if (checks.some(c => c.state === 'pending')) return 'pending';
  return 'passed';
}

async function checksFor(call: ReturnType<typeof api>, repo: string, sha: string): Promise<PullRequestView['checks']> {
  type CheckRun = { name: string; status: string; conclusion: string | null; html_url: string | null };
  type Status = { context: string; state: string; target_url: string | null };
  const checkRuns = await allPages<CheckRun>(call, `/repos/${repo}/commits/${sha}/check-runs`, p => (p as { check_runs: CheckRun[] }).check_runs);
  const statuses = await allPages<Status>(call, `/repos/${repo}/commits/${sha}/status`, p => (p as { statuses: Status[] }).statuses);
  const fromRun = (r: { status: string; conclusion: string | null }): QaState =>
    r.status !== 'completed' ? 'pending' : r.conclusion === 'success' ? 'passed' : 'failed';
  const fromStatus = (s: string): QaState => s === 'success' ? 'passed' : s === 'pending' ? 'pending' : 'failed';
  return [
    ...checkRuns.map(r => ({ name: r.name, state: fromRun(r), url: r.html_url })),
    ...statuses.map(s => ({ name: s.context, state: fromStatus(s.state), url: s.target_url })),
  ];
}

function view(repo: string, pull: GitHubPull, checks: PullRequestView['checks']): PullRequestView {
  const qa = qaOf(checks);
  const mergeable: PullRequestView['mergeable'] = pull.mergeable === false || pull.mergeable_state === 'dirty' ? 'conflicts'
    : pull.mergeable === null || pull.mergeable_state === 'unknown' ? 'unknown'
    : pull.mergeable_state !== 'clean' ? 'blocked' : 'clean';
  const fork = pull.head.repo?.full_name !== repo;
  const reason = pull.base.ref !== 'main' ? 'Only the main branch is an authorized merge destination.' : pull.draft ? 'Draft pull request.'
    : fork ? 'Branch lives in a fork; Promote only resolves conflicts on branches of this repository.'
    : qa === 'failed' ? 'QA failed on the head commit.'
    : qa === 'pending' ? 'QA is still running.'
    : mergeable === 'conflicts' ? 'Conflicts need reviewed resolution and a fresh CI run.'
    : mergeable === 'unknown' ? 'GitHub has not computed mergeability yet.'
    : mergeable === 'blocked' ? 'Branch protection blocks this merge.'
    : qa === 'none' ? 'No executed checks. Add validation before merging.' : 'QA passed.';
  return {
    repo, number: pull.number, title: pull.title, url: pull.html_url, author: pull.user?.login ?? 'unknown',
    base: pull.base.ref, head: pull.head.ref, headSha: pull.head.sha, draft: pull.draft, mergeable, qa, checks,
    canMerge: pull.base.ref === 'main' && !pull.draft && !fork && qa === 'passed' && (mergeable === 'clean' || mergeable === 'conflicts'), reason,
  };
}

/** Concurrent listings share one GitHub fan-out; a fresh listing is reused briefly. */
const LIST_CACHE_MS = 15000;
const listings = new Map<string, { at: number; result: Promise<PullRequestView[]> }>();

export function listPullRequests(config: PullRequestConfig, fetchImpl: Fetch = fetch, now = Date.now): Promise<PullRequestView[]> {
  const key = createHash('sha256').update(config.token).update('\0').update(config.repos.join(',')).digest('hex');
  const cached = listings.get(key);
  if (cached && now() - cached.at < LIST_CACHE_MS) return cached.result;
  const at = now();
  const result = fetchPullRequests(config, fetchImpl);
  listings.set(key, { at, result });
  result.catch(() => { if (listings.get(key)?.result === result) listings.delete(key); });
  return result;
}

async function fetchPullRequests(config: PullRequestConfig, fetchImpl: Fetch): Promise<PullRequestView[]> {
  const call = api(config, fetchImpl);
  const out: PullRequestView[] = [];
  for (const repo of config.repos) {
    const pulls = await allPages<GitHubPull>(call, `/repos/${repo}/pulls?state=open`, p => p as GitHubPull[]);
    for (const summary of pulls) {
      const pull = await call<GitHubPull>(`/repos/${repo}/pulls/${summary.number}`);
      out.push(view(repo, pull, await checksFor(call, repo, pull.head.sha)));
    }
  }
  return out.sort((a, b) => a.repo.localeCompare(b.repo) || a.number - b.number);
}

const defaultRun: Run = async (file, args, options) =>
  execFileAsync(file, args, { ...options, timeout: 120000, killSignal: 'SIGKILL', maxBuffer: 8 * 1024 * 1024, env: { ...process.env, ...options.env } });

/** Bring the branch up to date with its base in an isolated clone. Clerical
 * conflicts take the base's version (the PR's QA regenerates them); any other
 * conflict aborts and is reported for the owner. Nothing is force-pushed. */
const inFlight = new Set<string>();
export async function resolveConflicts(config: PullRequestConfig, pull: PullRequestView, run: Run = defaultRun): Promise<MergeOutcome> {
  const key = `${pull.repo}#${pull.number}`;
  if (inFlight.has(key)) return { state: 'refused', reason: 'in_progress', detail: 'Promote is already resolving this pull request.' };
  inFlight.add(key);
  try { return await resolveConflictsExclusively(config, pull, run, key); } finally { inFlight.delete(key); }
}

async function resolveConflictsExclusively(config: PullRequestConfig, pull: PullRequestView, run: Run, key: string): Promise<MergeOutcome> {
  const dir = join(config.workRoot, createHash('sha256').update(key).digest('hex').slice(0, 16)+'-'+randomUUID());
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const auth = Buffer.from(`x-access-token:${config.token}`).toString('base64');
  const env = {
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '3', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraHeader', GIT_CONFIG_VALUE_0: `Authorization: Basic ${auth}`,
    GIT_CONFIG_KEY_1:'core.hooksPath', GIT_CONFIG_VALUE_1:'/dev/null', GIT_CONFIG_KEY_2:'http.followRedirects', GIT_CONFIG_VALUE_2:'false',
    GIT_AUTHOR_NAME: 'Promote', GIT_AUTHOR_EMAIL: 'promote@localhost', GIT_COMMITTER_NAME: 'Promote', GIT_COMMITTER_EMAIL: 'promote@localhost',
  };
  const git = async (args: string[], cwd = dir) => (await run('git', args, { cwd, env })).stdout.trim();
  try {
    await git(['clone', '--quiet', '--no-tags', '--branch', pull.head, `https://github.com/${pull.repo}.git`, dir], config.workRoot);
    if (await git(['rev-parse', 'HEAD']) !== pull.headSha) return { state: 'refused', reason: 'pr_changed', detail: 'The branch moved while Promote was working; review it again.' };
    await git(['fetch', '--quiet', 'origin', pull.base]);
    let conflicted: string[] = [];
    try {
      await git(['merge', '--no-edit', '-m', `Merge ${pull.base} into ${pull.head}`, `origin/${pull.base}`]);
    } catch {
      conflicted = (await git(['diff', '--name-only', '--diff-filter=U', '-z'])).split('\0').filter(Boolean);
      if (!conflicted.length) { await git(['merge', '--abort']).catch(() => {}); throw new Error('merge_failed'); }
    }
    const substantive = conflicted;
    if (substantive.length) {
      await git(['merge', '--abort']);
      return { state: 'conflicts_need_owner', files: substantive, detail: `${substantive.length} file(s) changed on both sides in overlapping places.` };
    }
    const head = await git(['rev-parse', 'HEAD']);
    if (head === pull.headSha) return { state: 'refused', reason: 'nothing_to_merge', detail: 'The branch was already up to date.' };
    await git(['push', '--quiet', 'origin', `HEAD:refs/heads/${pull.head}`]);
    return { state: 'conflicts_resolved', pushedSha: head, regenerated: conflicted, detail: `Merged ${pull.base} into ${pull.head}; QA re-runs on the new head before the merge.` };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function mergePullRequest(
  config: PullRequestConfig, store: ControllerStore, rawInput: unknown,
  deps: { fetchImpl?: Fetch; run?: Run } = {},
): Promise<MergeOutcome> {
  const input = MergeInput.parse(rawInput);
  if (!config.repos.includes(input.repo)) return { state: 'refused', reason: 'repo_not_allowed', detail: 'Repository is outside PROMOTE_MERGE_REPOS.' };
  const call = api(config, deps.fetchImpl ?? fetch);
  const pull = await call<GitHubPull>(`/repos/${input.repo}/pulls/${input.number}`);
  const current = view(input.repo, pull, await checksFor(call, input.repo, pull.head.sha));
  const record = (outcome: MergeOutcome) => {
    listings.clear();
    store.recordActivity('pull-request', `${input.repo}#${input.number}: ${outcome.state}`, { ...outcome, headSha: current.headSha });
    return outcome;
  };
  if (current.headSha !== input.headSha) return record({ state: 'refused', reason: 'pr_changed', detail: 'New commits arrived; review the pull request again.' });
  if (!current.canMerge) return record({ state: 'refused', reason: current.qa === 'failed' ? 'qa_failed' : current.qa === 'pending' ? 'qa_pending' : 'not_mergeable', detail: current.reason });
  if (current.mergeable === 'conflicts') return record(await resolveConflicts(config, current, deps.run));
  const merged = await call<{ sha: string; merged: boolean }>(`/repos/${input.repo}/pulls/${input.number}/merge`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: current.headSha, merge_method: 'merge' }),
  });
  if (!merged.merged) return record({ state: 'refused', reason: 'github_declined', detail: 'GitHub did not perform the merge.' });
  return record({ state: 'merged', sha: merged.sha });
}
