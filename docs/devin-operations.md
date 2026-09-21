# Devin dispatch, independent QA and usage

Promote automatically dispatches scoped maintenance and optional sandbox exploration through Devin when the saved operating policy permits it. Durable reservations, exact-task mandates, session observation, bounded continuation, candidate fetching, protected-scope checks and independent maintenance QA are implemented. Passing maintenance QA produces a verified **candidate branch**, not permission to merge, deploy or publish.

## Configuration and authority

Set `DEVIN_API_KEY` and `DEVIN_ORG_ID` in the project-root `.env`, readable only by its owner. Environment variables take precedence. The service reloads provider readiness; credentials being present alone does not establish a verified connection. Never put credentials in task records, profiles or committed files.

The operating policy is persisted in `.local/controller.sqlite`. It controls pause, expiry, total and UTC daily ACU ceilings, maximum session ACU, concurrent sessions, approved repairs and proactive tests. Defaults are paused, zero total/daily budget, one concurrent session and a ten-minute review interval. Changing the review interval or extending expiry does not reset total committed budget. There is no automatic account replenishment.

`.local/maintenance-profiles.json` supplies named repository/check-out scopes, reproduction objectives, allowed/protected paths, baseline tests and attempt limits. Profiles can specify a smaller `maxAcu`; a newly created task receives the lesser of that ceiling and the operating policy's session ceiling. A persisted plan retains its original ceiling and is dispatched only if the current policy still permits it. The loader accepts at most 500 profiles; profile count is queue size, not simultaneous session count.

For each dispatched profile and repository revision, Promote freezes an engineering task and a mandate binding its hash, repository, incident, exact base commit, authorized paths, deadline, branch and ACU ceiling. Tasks have at most 90 minutes, bounded by policy expiry. Every mandate authorizes one session and candidate-branch output only; global concurrency comes from the saved operating policy. Editing a task invalidates its existing authorization.

Direct engineering commands remain available for a separately prepared `.local/engineering-task.json` and `.local/engineering-mandate.json`:

```sh
node --import tsx scripts/engineering.ts check
node --import tsx scripts/engineering.ts dispatch
node --import tsx scripts/engineering.ts observe
```

`check` is local and sends no provider request. The direct dispatch command and the autonomous maintenance scheduler both use the same durable engineering reservation boundary.

## Dispatch, observation and continuation

The scheduler verifies repository identity and resolves the remote main revision once per repository per cycle. It dispatches eligible profiles while both concurrency and budgets permit. A smaller approved task can proceed when a larger profile no longer fits. Due exploration receives a reserved slot when appropriate; exploration with existing findings for the same repository, revision and focus is not repeatedly purchased before those findings are reproduced.

Creation intent and budget reservation commit before transport. Ambiguous creation remains held without a blind retry and occupies capacity until reconciled. Provider observations run on a 15-second timer; overlapping observer runs are suppressed. The timer is not a guarantee that a slow provider cycle finishes in 15 seconds.

Deadlines, cancellation and exhausted session ceilings request termination. Confirmation requires an identity-bound provider exit, or a successful termination request with an archived, inactive (`suspended` or `error`) session. Devin can retain `suspended` after successfully terminating and archiving an inactive session; suspension or archive status alone never releases a slot. A successful response carrying that evidence avoids an extra confirmation poll. This follows the [Devin termination endpoint](https://docs.devin.ai/api-reference/v3/sessions/delete-organizations-sessions) and the observed archived-suspension response.

Returned engineering candidates and completed exploration reports trigger termination and collection. Expired engineering tasks still collect candidate and usage evidence before requesting termination; a failed collection does not prevent the stop request. Candidate SHA remains recorded if a later observation omits it. Confirmed stops release concurrency slots, while ACU reservations remain retained under the accounting policy. Stopped sessions remain eligible for read-only observations because billing can arrive later. Failed engineering termination requests expose the adapter's reason instead of appearing indefinitely as generic pending work.

When Devin explicitly reports `waiting_for_user`, Promote may continue the same task under current operating authority. Engineering continuation revalidates the saved exact-task mandate; exploration continuation checks the saved repository and testing authorization. Neither changes scope, deadline or ACU ceiling. Each session receives at most two messages, at least two minutes apart. Intent is persisted before transport; pending or uncertain delivery is never automatically resent, including after restart. `waiting_for_approval` remains held and is never implicitly approved.

## Independent candidate verification and retries

The maintenance journal lives in `.local/maintenance.sqlite`. Promote fetches the returned candidate branch, checks that its head matches the reported SHA and descends from the authorized base, and rejects changes outside allowed paths or inside protected policy/dependency paths. Candidate tests must be present in the source archive.

The controller builds a source archive and runs its own worker in an offline container. Existing baseline tests and test configuration are restored from the authorized base before execution; new candidate regression tests remain available. TypeScript and the profile's specified regression suites must pass. Evidence records bind the candidate, inputs, worker and container execution. The supported maintenance test paths currently begin with `tests/`; profiles requiring other subsystem test directories remain deferred until that evaluator contract supports them.

A failed independent check can trigger another paid attempt within the profile's attempt limit and remaining operating budget. The next task includes the previous candidate and bounded failure diagnostics. Infrastructure blocks, uncertain dispatch and absent failure evidence are not treated as authorization to buy a replacement session. After an infrastructure repair, the same candidate can be rechecked locally, retaining the prior verification record. A process restart recovers interrupted verification as awaiting verification.

Maintenance verification continues for already authorized candidates even when new paid dispatch is paused, expired or out of budget. A verified maintenance candidate is not an automatic release. Packaging, original-request regeneration, owner decisions and release activation use their separate contracts and evidence; maintenance QA alone does not satisfy them. The activity log is controller/session evidence, not a complete Devin conversation transcript.

## Budget interpretation and visibility

The Office, `/activity` and `/api/activity` expose controller actions, session states, QA progress and funding reservations. Provider-reported ACU is cumulative: repeated observations are not added, lower stale values do not refund usage, and missing usage remains unknown.

Budget admission uses reserved ceilings, or higher reported usage, rather than treating the latest usage reading as settled spend. Daily accounting uses UTC and retains unresolved carryover; total accounting remains bound to the campaign start across policy edits. The provider currently supplies no reliable settlement marker, so unused-looking amounts on stopped sessions remain retained and `releasableAcu` is zero. Reconciliation diagnostics distinguish known reported usage, unknown-usage sessions and retained terminal capacity. ACU reservations are not an invoice, and USD requires an account-specific rate.

The scheduler wakes every ten seconds but respects the configured review interval. The recovered September 20 campaign uses a **one-minute** review interval; the default is ten minutes. Project heartbeat checks are also policy-timed and persist their next due time. They cover intake health, checkout identity, held sessions, stale observations and blocked work. Chat intake, when configured, runs on a three-second timer.

See [September 20 session recovery](session-recovery-2026-09-20.md) for the recovered campaign snapshot and local evidence locations. The first historical F1 repair, dispatched September 19, used a 20-ACU session/total mandate; that historical authorization is separate from the later campaign policy.
