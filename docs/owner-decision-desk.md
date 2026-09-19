# Owner decision desk

The CEO desk projects real controller proposals into two trays: awaiting direction and decided. Selecting a proposal shows its evidence, proposed next action and the exact authority requested. Decisions are stored in `owner_decisions` in the local controller SQLite database, with a journal event in the same transaction.

The current approval is **planning only**. Commissioning a brief queues a `proposal_assessment` work item containing an immutable copy of the approved proposal. The local orchestrator produces a structured planning outline, retains the owner's feedback, and explicitly leaves scope and cost to further investigation. It does not call a model, reserve ACUs, write repository files or release code. Paid engineering still uses the existing exact-task `EngineeringMandate` contract; its budget approval UI is not implemented here.

Request changes requires written direction. Declining removes the proposal from the office backlog. Commissioned planning appears in active work and moves to review when its planning outline is ready. Every decision remains in the journal. New evidence changes the revision and requires a fresh decision.

`POST /api/owner-decisions` requires the loopback host, exact same-origin header, JSON content type and the current server's owner-session token. Request bodies are limited to 12 KB and validated strictly. This is a local operator surface, not remote multi-user authentication. A proposal/evidence hash binds each decision to the reviewed revision. Identical retries are idempotent; conflicting or stale decisions return 409. Approval and queue insertion are atomic.

Desktop controls are registered to the physical CEO folio as the camera moves. Mobile uses an accessible reading layout to preserve legibility. Overview and activity bubbles use the unresolved proposal count. Demo mode cannot mutate live decisions.

Validation covers stale evidence, conflicting/repeated submissions, source checks, invalid payloads, persistent owner feedback, planning completion without engineering authority, and browser review on desktop/mobile. Browser approval tests use a separate in-memory fixture server, never the live project.
