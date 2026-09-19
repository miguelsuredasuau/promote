# Owner briefing and project inspection

Start the local read-only console with `pnpm dev`, then open `http://127.0.0.1:4310`. Optionally set `PROMOTE_PROJECT_PATH` to an external Xarts checkout. Without it, the console still starts and reports the checkout unavailable. No project files are written.

The console polls `GET /api/overview` every five seconds. It presents separate sources of truth:

- **Implementation progress:** checked-in milestone and verification records. These describe the product build, not live model work.
- **Project readiness:** configured checkout availability, observed full Git HEAD, and whether it matches the catalog's audited revision. Paths and Git errors are not exposed to the browser.
- **Owner briefing:** visible backlog counts from persisted incidents, plus explicit placeholders for unconfigured mandate, feedback, decision and spend integrations. Unknown spending is not zero.
- **Engineering records:** persisted incidents, dispatch operations, outcomes and chronological events. Claim tokens remain server-side. The current storage interface supports recording these; no paid provider dispatch is connected yet.
- **Gate inspection:** audited command arrays, prerequisites, independence limits and autonomy mappings. NOT_RUN stays distinct from a passing gate. No catalog entry is executed by opening the UI.

The snapshot bounds each incident, operation and event collection to the latest 100 records; backlog counts explicitly use that visible window. Full-history pagination and durable report aggregates remain future work. The isometric office is a department map; it does not animate fictional model activity.

The browser keeps the last snapshot with a stale warning when disconnected, and reconnects automatically. Gate and incident details are rendered as text, never executed as HTML. Static assets are allowlisted; this server does not serve arbitrary repository files, environment files, database contents or raw transcripts. The local server binds to loopback and rejects foreign Host/Origin values. It does not implement deployment authentication or write APIs; do not expose it as a public control service.

## What the owner will eventually delegate

See [CEO mandate](ceo-mandate.md) for routine-work authority, investment decisions, customer feedback and engineering spend accounting. The current read-only report does not grant budgets, approve proposals, or authorize a failed gate. Those workflows need versioned policy and durable reservation/decision records before controls become active.
