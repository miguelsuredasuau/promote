# Session recovery — September 20, 2026

The recovered coding session was **Review DEVINWIKI.JSON project**, ID `01a0b8ae-acd7-7573-a6be-18860a6caf93`. Its retained trace ends at **2026-09-20 12:56:44 UTC**, or **14:56:44 Europe/Madrid**. No error explaining the stop was recorded in that trace. The cause remains unknown; the available evidence does not establish a crash, cancellation or successful completion.

Recovery continued from the existing workspace, uncommitted changes, controller records and maintenance journal. It did not assume that ending the coding session ended every remote Devin session. Existing candidates and uncertain provider operations retained their identities and evidence instead of being recreated blindly.

## Work recovered

The unfinished continuation implementation was completed and tested. Waiting sessions can receive bounded same-task continuation under their original authority; approval requests and uncertain deliveries remain held. Engineering candidate identity is retained across incomplete later observations. Budget diagnostics now distinguish reported usage from ceilings still reserved because provider usage is not settled.

The maintenance loop now supports smaller per-profile ACU ceilings, repository-head reuse within a cycle, eligible-task scheduling and independent QA while paid dispatch is paused. Candidate verification infrastructure was repaired so affected existing candidates could be rechecked without a new paid session. Rechecks retain earlier evidence rather than replacing the historical failure record.

The controller runs under the local **launchd** service `com.anlak.promote` in `gui/501`, with logs under `.local/logs/`. This supervises the local service; it does not make provider outages, a sleeping/offline computer or expired authorization disappear. Office integration reads the controller's operating and session state, including queued work, active engineering and verification progress.

## Authorized campaign snapshot

The user explicitly authorized a **2,000-ACU total ceiling**. The recovered saved policy also sets a 2,000-ACU daily ceiling, permits **20 concurrent sessions**, and uses a **one-minute review interval**. The activated maintenance catalog contains **200 distinct scoped profiles**: the original 15 plus 185 additional source/test-backed tasks. A live recovery snapshot recorded **20 running sessions**. These are campaign and running-state counts, not a claim that all 200 tasks completed or passed QA.

The additional profiles use 5- or 10-ACU session ceilings, require reproduction before a production change, preserve baseline tests and allow at most two attempts. Source scope, current evaluator-compatible test paths and archive availability were checked before activation. First attempts across those 185 additions reserve at most 960 ACU; two attempts for every addition would reserve 1,920 ACU, excluding existing work and the original 15 profiles. The saved global ceiling still determines which attempts can actually dispatch.

Static analyzer findings are prioritization evidence, not a count of proven defects. Tasks may report a justified coverage-only improvement or stop when the existing contract already holds. Four card tasks remain separately deferred because their existing subsystem test paths are unsupported by the current maintenance worker; their gates were not silently removed. Historical exploratory observations for the separate Xarts-chat repository were retained separately from the Xarts library repair scopes.

## Local evidence retained

These paths identify private local evidence; their contents are not copied into this document:

- `.local/controller.sqlite` — operating policy, reservations, observations and activity.
- `.local/maintenance.sqlite` — task journal, candidates and verification history.
- `.local/campaign-before-recovery.json` and `.local/maintenance-before-session-recovery*.json` — pre-change snapshots.
- `.local/activate-recovered-campaign.ts` and `.local/expand-recovered-campaign.ts` — reviewed campaign activation steps.
- `.local/recover-maintenance.ts` — same-candidate verification recovery.
- `.local/maintenance-profiles.json` — activated profile catalog.
- `.local/maintenance-backlog.provenance.json`, `.local/maintenance-backlog.validation.json` and `.local/maintenance-backlog.review.md` — source/test inventory, preparation checks and limitations.
- `.local/maintenance-backlog.deferred.json` and `.local/maintenance-backlog.exploration-review.json` — deferred scopes and separately attributed exploration observations.
- `.local/maintenance-validation/` and `.local/logs/controller.stdout.log` / `controller.stderr.log` — independent execution evidence and service logs.

At integrated recovery validation, the full suite passed **391 tests with five skipped** across **38 test files**, including activity telemetry, the Office pipeline and bounded provider observations. These results validate the corresponding controller changes, not future Devin candidates. The three candidates whose earlier checks used an incomplete test archive subsequently passed independent rechecks with their original commit identities retained. Maintenance output remains candidate-branch-only and must pass its own independent checks. No automatic merge, deployment, publication or additional funding top-up is implied by the campaign authorization.
