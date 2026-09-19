# Devin dispatch and usage

The adapter, durable creation intent, exact-task mandate, ACU reservations and observer are implemented. Transport failure tests use mocked responses; the first live F1 session is now dispatched (see below). This is candidate collection, not a verified autonomous release loop.

The local F1 task draft is `.local/engineering-task.draft.json`. Its deadline and ACU ceiling are deliberately unset; it cannot authorize dispatch.

## Configuration

Set `DEVIN_API_KEY` and `DEVIN_ORG_ID` in the project root `.env` (owner read/write only). The fal studio reads `FAL_KEY` from the same file. Environment variables take precedence. The service reloads `.env` during readiness checks. Never put credentials in an engineering task or committed file.

Place a validated EngineeringTask in `.local/engineering-task.json`. It specifies the incident, repository, exact base commit, allowed/protected paths, reproduction, deadline and `providerExtension: {maxAcu: <approved positive integer>, branch: "promote/..."}`.

Place an EngineeringMandate in `.local/engineering-mandate.json`, using `contracts/mandate.ts`: explicit approver/time/expiry, repository and incident scope, `taskHashes[incidentId] = hashCanonical(task)`, approved per-session and total ACU ceilings, one concurrent session and `candidate_branch_only` destination. There is no default budget. Rewriting an approved task invalidates its authorization.

```sh
node --import tsx scripts/engineering.ts check
node --import tsx scripts/engineering.ts dispatch
node --import tsx scripts/engineering.ts observe
```

`check` is local and sends no provider request. `dispatch` is the only creation command. The running service reloads readiness and observes existing sessions every 15 seconds; it never creates sessions automatically. Configured credentials are not described as a verified connection.

The activity page at `/activity` and JSON `/api/activity` show readiness, provider events, session states, reserved ACU ceilings and cumulative provider-reported usage. Missing usage stays unknown. Repeated observations are not added together. USD is unknown until an account-specific rate is verified. Native provider ceilings are not a claim of dollar-exact billing; reported usage can lag. Reserved ceilings are not refunded automatically.

Creation is claimed durably before the network call. Ambiguous creation is held without retries; it requires reconciliation with the provider. One unresolved session holds the engineering slot. Cancellation/deadlines request termination, confirmed only after observed exit. A returned candidate is stopped pending independent evaluation; it is not accepted or published. Stopped sessions remain observed for delayed usage.

## Outstanding integration

Implement candidate fetching, protected scope checks, the frozen Xarts SDK gates, packaging and original-chat-request regeneration before enabling autonomous releases. Automatic incident triage, correction orchestration, operator reconciliation and full provider conversation ingestion also remain outstanding. Currently the log records controller actions, status, candidate SHA and usage; it is not a complete Devin conversation transcript.

API reference: https://docs.devin.ai/api-reference/v3/sessions/post-organizations-sessions

## Project heartbeat

The service performs a local project review every ten minutes. The last review and next due time persist in SQLite across restarts. Checks cover checkout availability/revision, untriaged records, intake health, blocked or stalled incidents, held sessions and stale provider observations. The activity page and overview JSON expose findings and the next review time. These are recommendations, not automatically created defects or paid repair sessions. Existing provider sessions are still observed every 15 seconds; chat intake remains on its three-second loop.

The first live F1 repair was dispatched on 2026-09-19 with a 20-ACU total/session ceiling and a two-hour deadline, candidate branch only. The USD estimate uses the user's approximate $2.50/ACU rate; it is not a verified invoice. The user confirmed available prepaid credit and disabled auto-reload. Subsequent repairs require a new task authorization; no automatic replenishment is implemented.
