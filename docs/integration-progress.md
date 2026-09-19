# Integration progress — 2026-09-19

The live local service now receives chat run records, explicit ratings/preferences,
quality/coverage snapshots and new progress journals. Its SQLite inbox deduplicates
immutable records and rejects conflicting updates. Receipts are written on Promoted's
side. Original chat outbox files are never removed. All existing 15 turns and five
feedback events imported successfully, followed by two diagnostic snapshots.

## Observe it

- `/activity`: dedicated service activity page, reachable from the office's Service activity link.
- `/api/activity?after=<sequence>`: durable service events, cursor, intake heartbeat and actual counts.
- `/api/inbox`: received observations and feedback, separate from engineering incidents.
- `/api/chat-progress/<runId>?after=<ordinal>`: imported user-visible chat progress.
- `/api/incidents/<incidentId>?after=<sequence>`: durable incident history.
- Console output is captured by the current local launcher in `.local/integration-server.log`.

The intake loop polls every three seconds. The activity page polls every two seconds.
New receptions and workflow transitions are logged; routine duplicate polling does not
invent new work. The intake heartbeat proves that idle polling is still running.
Existing runs retain their final request/response and tool records. Their old streamed
progress is unavailable; new journals are not backfilled with fabricated events.

## Implemented and checked

- Stable per-incident create intent prevents alternate operation IDs bypassing dispatch protection.
- Transactional incident transitions, sticky cancellation intent and service events.
- Durable, single-slot **fixture** workflow steps: reproduce, dispatch, candidate,
  evaluate, feedback, correction, termination and release. Failed/ambiguous effects
  stay held; abandoned claims are never silently expired into duplicate execution.
- Acceptance uses the frozen profile and candidate/input/evaluator identity. Office QA
  can consume the complete persisted evaluation projection with actual adapter gate IDs.
- Docker runner: trusted exact command allowlist, digest-pinned image, verified read-only
  file inputs, unprivileged user, blocked network, no host credential environment or Docker
  socket, resource/output ceilings, timeout termination and cleanup. It currently collects
  the execution log; it is not a full candidate checkout/package artifact runner yet.
- Local registry writer: bound evaluated hashes, immutable package/output/manifest records,
  serialized atomic pointer activation, current-authority callback and previous-release
  preservation on preactivation failures. Chat's actual reader accepts the wire contract
  and refuses tampered package bytes in the cross-repository check.
- Chat shared changes are documented under integration v1.1 in its `docs/INTEGRATION.md`.
  Future chat UI, provider-process and release-reader edits belong to Claude.

## Real diagnosis

The first issue, F1, was reproduced under Node 22.22.1 at Xarts base
`e3ebca5ee3712cb1396d774cbc1ef87e4772614d`: SDK compilation fails with TS2339 because
`pasos` is missing on `EscuchaDeclarada` in the SDK compilation graph. Logs and
reproduction metadata are local under `.local/integration-evidence/`; immutable
source evidence is retained under `.local/artifacts/`.

Incident `xarts-sdk-build-e3ebca5ee371` records the reproduction. Devin has since returned a candidate and its exit is confirmed. The local QA scope check found an added regression test outside the originally approved paths; acceptance remains blocked. This baseline check ran as a trusted local
process; it is not evidence of isolated candidate evaluation. No code repair or new
Xarts package has been activated.

## Verification

- Promoted: 155 controller tests and 18 Studio tests pass; TypeScript check passes. The latest four opt-in Docker checks timed out, so isolated execution is not re-certified by this run. Earlier Docker checks passed.
- Chat: 23 unit tests pass.
- Cross-repository seam check: actual producer record/feedback/progress functions →
  Promoted import → registry writer → actual chat resolver; duplicate/tamper/failure
  cases pass. Uses synthetic package bytes; installation and chart rendering are not
  claimed by this check.
- Service activity browser QA: desktop/mobile, no overflow or JavaScript errors,
  real role states, objective, next action and inbox visible; ticker opens the shared operations journal.

Run the opt-in integration checks with:

```sh
PROMOTE_DOCKER_TEST=1 pnpm test
PROMOTE_CHAT_PATH=/path/to/xarts-chat node --import tsx scripts/check-chat-integration.ts
```

## Remaining before real autonomy

The production entry point runs intake, provider observation and the ten-minute durable scheduler. Fixture workflows remain separate.
The Devin adapter, exact-task mandates, ACU reservation ledger and observer are now implemented (see devin-operations.md). A bounded live session has completed. Automatic local triage and proposal assessment run without model calls. A verified real candidate → package → original-chart loop is still incomplete.
Held jobs require explicit reconciliation; automatic recovery of external effects is
not implemented. Registry crash recovery and installation/regeneration must be proved
with a real package before enabling automatic activation. Fixture results must never
be routed into the chat's real active registry.

Next: resolve the candidate scope finding, connect the Xarts evaluator/package plans, then complete F1 and F2 using the frozen acceptance
checks. F5 formatting and the 27 clipping cases follow the packaged-consumer repair.
