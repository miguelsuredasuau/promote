# Resume Promote after September 20, 2026

Start here when reopening this project. User is shutting down the Mac.

## Current authorization and runtime

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
