# Resume Promote — updated September 21, 2026

Start here when reopening this project. The September 21 continuation is followed by the previous shutdown checkpoint for historical context.

## Campaign closed by owner — September 21

The owner ended the old maintenance plan and authorized consolidating good candidates into main, then removing campaign branches. Operating policy revision 4 is paused with approved repairs and proactive tests disabled. All 181 engineering reservations were confirmed stopped; no exploration remains active. The launchd service was stopped between QA jobs and disabled. Do not resume paid dispatch without a new instruction.

The owner explicitly said Claude is still editing the visx-anlak census: preserve that local work, including its CI and package-script edits. Consolidation runs in a detached temporary worktree, never by cleaning or stashing Claude's checkout.

Consolidated **101 verified candidates** into visx-anlak main, commit `5c7413ff9381be575688862d40a2992a8b648601`. The Hexbin candidate was excluded after an integration golden/parity regression; baseline references were not changed. All **165 remote Promote campaign branches were deleted** after archiving complete history in `.local/campaign-candidates-2026-09-21.bundle`. No local Promote candidate branches remain. Selection, exclusions, provenance and deletion evidence are in `.local/consolidation-*.json`.

Validation: 375 test files, 7,770 passing tests and 23 existing skips, repeated with Madrid and New York timezones; typecheck, Vite build, 66 SDK tests and SDK build passed. Catalog checks: 35 pass, no failures, one external personal-catalog check skipped. Logs retained under `.local/consolidation-validation/`. GitHub Actions run 35573459479 could not start any job because GitHub reported failed account payments or a spending-limit issue; local validation passed, remote CI is not green. Do not change billing without authorization.

Claude's checkout remains on `anatomia-y-gate-de-tintas`, with its ongoing local edits preserved. Local and remote library main both point to the consolidation; do not switch or clean Claude's working tree. The consolidation provenance is in `docs/analysis/promote-maintenance-consolidation-2026-09-21.md` in the library.

The remaining sections are historical checkpoints, not instructions to restart this campaign.

## September 21 continuation

### Automatic session release repaired and activated

- The owner explicitly authorized closing/archiving the 17 expired inactive Devin sessions and activating a permanent reconciliation fix. The local service was reloaded between QA jobs.
- All 17 are now confirmed stopped with their candidate SHAs retained; proof: `.local/session-release-proof.json`. No direct database override was used: the regular observer reconciled them through the corrected adapter.
- Root cause: Devin returns HTTP 200 with `is_archived: true` and `status: suspended` when terminating these inactive sessions. The old adapter required literal `exit` forever. It now accepts successful identity-bound termination with archived inactive evidence, while failed requests, active states and suspension alone retain the slot. Successful response evidence avoids an extra GET.
- Expired engineering sessions now collect late candidates/usage before stopping. Failed reads do not block cancellation; failed stop requests expose their reason. Slot release does not refund ACU reservations.
- Full Node 22 + Docker validation: **413 tests passed**, 38 files, zero skips. Log: `/tmp/promote-session-release-check.log`.

- The host and `com.anlak.promote` service restarted successfully with commit `2004812`. Docker was stopped; it has now been started and local QA is progressing again.
- The pending MCP startup failure was reproduced successfully with one Vitest worker: all nine tests pass under the original 64-PID, one-CPU, offline limits. `adapters/xarts/maintenance-worker.mjs` now uses `--maxWorkers=1`; baseline assertions and timeouts are unchanged. The worker is read per verification, so this change requires no service restart.
- `pnpm check` on Node 22 with `PROMOTE_DOCKER_TEST=1` passed 398 tests in 38 files, zero skipped. Log: `/tmp/promote-resume-check.log`.
- The original MCP candidate and five startup-blocked candidates were queued for same-candidate rechecks with prior evidence retained. Recovery script and snapshots are under `.local/`; no replacement paid sessions were created by these recovery scripts.
- Both the direct full MCP recheck and the service-owned recheck passed; the journal marked attempt 1 verified at 05:41:39 UTC. Direct evidence: `.local/mcp-errors-recheck-2026-09-21.json`. Final snapshot: 30 verified attempts, one verifying, 29 awaiting QA; these are candidate attempts, not merged changes.
- Saved policy remains active with the original 2,000-ACU total ceiling. A snapshot showed 890 ACU reserved (not billed spend), 63 stopped / 17 held / 3 running provider engineering sessions. Let the observer reconcile existing identities. These live counts change.

## Previous shutdown checkpoint: authorization and runtime

- Explicit user authorization: 2,000 ACU total campaign ceiling; saved daily ceiling also 2,000; concurrency 20; review every minute; expiry September 27, 2026. No additional funding top-ups authorized.
- 200 approved maintenance profiles in `.local/maintenance-profiles.json`; 185 new profiles use 5/10 ACU session ceilings. Do not recreate existing sessions or reset reservations.
- Promote is a LOCAL launchd service `com.anlak.promote` in `gui/501`, KeepAlive/RunAtLoad. It survives closing Codex, but NOT shutting down/sleeping the Mac. Remote Devin sessions may continue independently; local dispatch and QA resume only when the host/service returns. No always-on remote deployment exists.
- A temporary eight-hour awake assertion was started with `launchctl submit -l com.anlak.promote.awake -- /usr/bin/caffeinate -is -t 28800`; this does not prevent explicit shutdown or provide remote hosting.
- Last checked around 15:35 Madrid: 16 running engineering sessions, one held, 56 stopped; 24 verified maintenance attempts, one verifying, 23 queued for QA. Counts change live. These are attempts, not unique profiles or released changes.

## Saved implementation

- Recovery commit: `9b4315d` (Office pipeline, accurate activity/spend labels, bounded continuation, per-profile budgets, scheduler fairness/cache, independent QA progress, bounded historical observation, startup availability).
- Follow-up failed-container diagnostic export fix is in `server/container-runner.ts`, `server/maintenance-evaluator.ts` and their tests. It passed the full suite including real Docker: **398 tests passed, zero skipped**, 38 files. Log: `/tmp/promote-campaign-docker-check.log`. Check Git status/log for its follow-up commit.
- Latest code has NOT yet had its final service reload. Running service last restarted before the observer/startup/heartbeat improvements and diagnostic export fix. Reload after checking current work; `.local/reload-promote-idle.py` waits for a QA gap and restarts the supervised service. On a fresh boot it will load latest files automatically.
- Work remains candidate-branch-only. Verified candidates are NOT automatically merged, published or deployed.

## First actions after reopening

1. Read `docs/session-recovery-2026-09-20.md` and `docs/devin-operations.md`; inspect Git status before changing files.
2. Check Docker, `launchctl print gui/501/com.anlak.promote`, and `http://127.0.0.1:4310/api/operating-policy` / `api/maintenance` / `api/activity`. Let the existing observer reconcile remote sessions; do not blindly relaunch them.
3. Retain `.local/controller.sqlite`, `.local/maintenance.sqlite`, profiles and validation evidence. In-flight QA is recovered by the journal on startup; expired remote task deadlines are enforced when observation resumes.
4. Inspect returned candidates, queued QA and failed attempts. The three original missing-fixture candidates (runtime-api, preview-actions, image-export) all passed corrected same-commit rechecks.
5. Investigate MCP-errors baseline timeout if still relevant. Attempt 1's six new tests passed, but baseline `tests/unit/mcpSobre.test.ts` timed out in startup at 120 seconds. Promote automatically launched attempt 2. Candidate diff only changes error redaction; a direct isolated startup probe succeeded, so the original two-worker test environment still needs diagnosis. See `.local/mcp-errors-investigation.md` if present and retained maintenance logs. Do not assume this is a proven candidate defect or suppress baseline tests.
6. If user needs work while the Mac is shut down, deploy the controller AND its required verification/runtime infrastructure to an authorized always-on host. No such deployment was completed; never claim local launchd/caffeinate survives shutdown.

## Session identities and artifacts

Original interrupted session: `01a0b8ae-acd7-7573-a6be-18860a6caf93`, “Review DEVINWIKI.JSON project”; trace ends September 20 at 14:56:44 Madrid without an explanatory error.

Recovery session: `01a0bee6-bfa9-7400-80ba-8d966fa18f4d`, “Recover and continue session”.

Private local preparation/recovery artifacts: `.local/maintenance-backlog.{draft,provenance,validation,review}.json` (review is `.md`), `.local/campaign-before-recovery.json`, `.local/maintenance-before-session-recovery*.json`, `.local/maintenance-validation/`, `.local/logs/`.

Office screenshot: `/tmp/promote-recovered-pipeline.png`; activity screenshot: `/tmp/promote-recovered-activity.png`. Temporary files may disappear after reboot; durable runtime evidence is under `.local/`.
