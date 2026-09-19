# Owner briefing and project inspection

Start the local read-only console with `pnpm dev`, then open `http://127.0.0.1:4310`. Optionally set `PROMOTE_PROJECT_PATH` to an external Xarts checkout. Without it, the console still starts and reports the checkout unavailable. No project files are written.

The console polls `GET /api/overview` every five seconds. It presents separate sources of truth:

- **Implementation progress:** checked-in milestone and verification records. These describe the product build, not live model work.
- **Project readiness:** configured checkout availability, observed full Git HEAD, and whether it matches the catalog's audited revision. Paths and Git errors are not exposed to the browser.
- **Owner briefing:** visible backlog counts from persisted incidents, plus explicit placeholders for unconfigured mandate, feedback, decision and spend integrations. Unknown spending is not zero.
- **Engineering records:** persisted incidents, dispatch operations, outcomes and chronological events. Claim tokens remain server-side. The current storage interface supports recording these; no paid provider dispatch is connected yet.
- **Gate inspection:** audited command arrays, prerequisites, independence limits and autonomy mappings. NOT_RUN stays distinct from a passing gate. No catalog entry is executed by opening the UI.

The snapshot bounds each incident, operation and event collection to the latest 100 records; backlog counts explicitly use that visible window. Full-history pagination and durable report aggregates remain future work. Live scene displays are projections of recorded state; demo activity is explicitly illustrative.

The browser keeps the last snapshot with a stale warning when disconnected, and reconnects automatically. Gate and incident details are rendered as text, never executed as HTML. Static assets are allowlisted; this server does not serve arbitrary repository files, environment files, database contents or raw transcripts. The local server binds to loopback and rejects foreign Host/Origin values. It does not implement deployment authentication or write APIs; do not expose it as a public control service.

## What the owner will eventually delegate

See [CEO mandate](ceo-mandate.md) for routine-work authority, investment decisions, customer feedback and engineering spend accounting. The current read-only report does not grant budgets, approve proposals, or authorize a failed gate. Those workflows need versioned policy and durable reservation/decision records before controls become active.

## Full-viewport office upgrade

The main route is now the interactive Xarts Office. Five raycast-selectable scene objects and keyboard-accessible Office menu buttons open the backlog, engineering event terminal, strategy wall, QA inspector and finance safe. A separate CEO briefing retains milestones and verification evidence. The in-room ticker shows known counters and leaves unconnected usage/error/PR/cost telemetry unknown.

Live is the default. Explore demo supplies clearly labeled browser-only illustrative tasks, output, QA states and expenses; switching modes never changes controller data. The finance example is not an approved spend limit. Characters animate in demo; conveyor movement follows the projected QA state. Camera approaches and surface reveals honor reduced motion.

An optional logo is fetched from `/api/project/logo`, which serves only `xarts.svg` from the configured checkout under a sandboxed SVG policy. The logo is absent from public Git history. The main scene now uses Three.js; the separate `/qa-prototype` remains the earlier renderer trial.

The scene textures and detail surfaces consume one browser model. The demo supports moving non-pipeline kanban cards, a seven-step repair story, candidate-bound QA outcomes, terminal logs and illustrative finance. Pipeline-owned cards cannot bypass acceptance by dragging. Unknown live evidence and costs remain unknown. Labels appear on hover or menu focus; opening a station approaches it with the camera and reveals a HTML working surface registered to the actual mesh face. The detail controls remain accessible HTML. Orthographic projection maps their corners onto the mesh face every animation frame, so camera motion and controls stay aligned. The camera turns toward the selected face and frames its dimensions; Escape returns to the room.
