# Xarts candidate delivery

Promote can schedule an isolated build, standalone package verification and replay
of a saved chat request. Only passing evidence authorizes registry activation.
This is independent of Devin session creation and does not create paid sessions.

## Configuration

Put a trusted operator task in ignored `.local/delivery-task.json`:

```json
{
  "schemaVersion": 1,
  "attempt": 1,
  "checkout": "/absolute/path/to/visx-anlak",
  "repo": "owner/visx-anlak",
  "baseSha": "FULL_BASE_COMMIT_SHA",
  "candidateSha": "FULL_CANDIDATE_COMMIT_SHA",
  "chatRoot": "/absolute/path/to/xarts-chat",
  "runId": "SAVED_RUN_ID",
  "chartId": "chart-1",
  "registry": "/absolute/path/to/promote/.local/registry",
  "allowedPaths": ["core", "render-cli", "tests/sdk"],
  "protectedPaths": ["docs", ".github"]
}
```

The scope belongs to this delivery task. It does not rewrite the historical
engineering mandate. The candidate must descend from the base and the checkout's
origin must match the configured repository. The task pins a full commit. An optional `sourceBranch` (a `promote/…` or
`promote-…` branch) lets the scheduler fetch new commits on each review. It freezes
the fetched SHA into a new task; moving a branch never changes an in-flight candidate.
Every new commit must still pass scope, ancestry and all independent gates.

### Releasing the trunk

When the owner has merged pull requests and wants the chat on the library's own
`main`, add `"trunk": "main"` to the task with `candidateSha` set to that head.
Promote asks the remote (`git ls-remote origin refs/heads/main`) and refuses with
`trunk_head_mismatch` unless it serves exactly that commit, so a task never releases
a local branch that GitHub does not have. Because the owner authorised the content
by merging, `allowedPaths`/`protectedPaths` are recorded in the evidence as changed
paths but not enforced; ancestry from `baseSha` (normally the previously released
commit or its merge base) and every isolated gate still apply unchanged.

The ten-minute review checks Docker availability and queues one durable QA job.
The service starts serving Activity before lengthy verification begins. A running
claim survives restart and requires reconciliation rather than duplicate execution.
A blocked attempt is retained; a reviewed retry increments `attempt` (maximum 3).
There is no automatic additional Devin budget or silent retry of paid effects.

For an explicit local run, use Node 22:

```sh
node --import tsx scripts/deliver-xarts.ts .local/delivery-task.json
```

This command publishes on success. `scripts/validate-xarts.ts <checkout> <sha>`
only builds and tests; it cannot activate a release.

## Acceptance and evidence

1. Verify repository identity, ancestry and changed paths. Run the saved SQL against
   the chat database opened read-only. Its rows must reproduce the original data
   hash and row count. A saved spec containing `data` is rejected.
2. Snapshot committed sources, prepare dependencies with the frozen lockfile and
   lifecycle hooks disabled, then run compiler regressions and the SDK build in a
   non-root, offline Docker container. Dependency preparation itself uses network.
3. Install the exact exported tarball in a separate image containing no source
   checkout, with installation scripts disabled. Offline, run the baseline's
   protected standalone Node consumer assertions, render the original SQL-backed
   request, reject non-finite output and check that altered numeric input changes
   the SVG. No chat shims are installed.
4. Bind the candidate, original inputs, evaluator source hashes and gate profile.
   Activate only the exact package and SVG hashes that were checked, while holding
   the incident's publication authority. Cancellation or changed evaluator code
   prevents publication. The active registry pointer is replaced atomically.

Container output collection permits only named regular files, with bounded tar
responses; symlinks and directories are refused without extraction into host
paths. Private source, logs and generated packages remain under ignored `.local/`.
The runner restricts CPU, memory, process count, wall time, logs and per-file writes.
The export volume is temporary; its aggregate disk usage is not a filesystem quota,
so adequate Docker disk space remains an infrastructure prerequisite.

Activity records each gate and links its hash-checked log. The office ticker uses
those same delivery states. A failure preserves the existing active release.
Execution failures are not proof of a library defect.

## Chat connection

Start the chat with `PROMOTE_REGISTRY` pointing at the task's registry directory,
or run `node scripts/start-chat.mjs /absolute/path/to/xarts-chat` from Promote.
The existing chat resolver reads the active pointer for subsequent requests,
verifies the tarball and refuses corrupted promoted releases. Promote does not
replace Claude's release resolver or modify the chat's source of chart numbers.

## Current validation limits

The delivery control flow has automated tests for successful activation, failed
consumer verification, cancellation and idempotence. These use explicit fixture
execution ports and do not stand in for a real Xarts release. Docker isolation and
artifact export tests also run against actual containers.

On 2026-09-19 the F2 candidate's nine compiler tests passed both locally and inside
Docker. Its full SDK build was interrupted when Docker's VM stopped after disk
pressure. No F2 package has passed standalone verification or been activated yet.
A future successful run must replace this status with its actual release evidence.
