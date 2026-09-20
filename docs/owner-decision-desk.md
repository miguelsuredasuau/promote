# Owner decision desk

The owner's desk is for product direction. Routine bugs, infrastructure problems, feedback and small feature requests stay in the team's backlog and receive planning automatically. The office counter and CEO bubble count only unresolved proposals that need owner direction; they no longer turn every diagnostic observation into an approval request.

## What reaches the owner

The current deterministic routing elevates feature proposals whose titles identify changes such as pricing, subscriptions, new markets, a product pivot, platform migration or a redesign. This is an initial classification rule, not a semantic model or proof of business impact. Ambiguous and small requests remain investigations: classification never authorizes implementation or spending. Budget/mandate blockers remain visible in Activity and are not silently approved by hiding routine proposals.

A decision explains the proposed direction, why it matters, our recommendation and a visual comparison of the current direction with the idea to explore. The actions are **Explore this direction**, **Adjust the direction**, and **Keep our current focus**. Evidence and implementation details are available in a disclosure. Cost estimates are not invented. The comparison is a schematic, not a screenshot of an implemented feature.

When no decision needs the owner, the desk says so and links to the team's activity. It shows the number of unresolved routine items tracked, without describing queued or blocked work as already fixed. Earlier owner decisions remain in the Decided tray, including decisions on technical proposals made before this routing change.

## What the team does automatically

Every proposal assessment produces a planning outline with the available evidence, next investigation steps, and whether owner direction is needed. Versioned, evidence-bound work IDs avoid repeating the same assessment and allow new evidence to receive a fresh assessment. No owner commission is required for routine analysis.

The autonomy target is to handle almost all routine decisions; **99% is not a measured result or an unlimited execution mandate**. Current engineering still requires an exact authorized task, path scope and ACU ceiling. Existing verification, publication and merge policies remain in force. This change does not add automatic code repair or blanket automatic merging for every proposal. Broader routine execution needs a separately defined reusable mandate and budget reservation policy; it must not be simulated by relabelling planning as delivery.

## Persisted decisions and authority

Exploring a direction retains the existing `approve_plan` action. It queues a planning task bound to an immutable proposal revision. It does not authorize a paid session, repository write or release. Requesting changes requires written direction. Decisions and journal events persist together in the controller SQLite database.

`POST /api/owner-decisions` requires the loopback host, exact same-origin header, JSON content type and current owner-session token. Bodies are bounded and strictly validated. Identical retries are idempotent; conflicting or stale decisions return 409. Existing direct decision actions remain compatible; UI routing is not an authorization boundary.

## Validation

Tests cover routine-versus-direction routing, automatic planning without paid dispatch or owner decisions, assessment idempotency, existing revision-bound decisions, and all prior controller behavior. Browser review covers the real empty decision tray at desktop and mobile widths plus a synthetic product choice rendered locally without sending approval requests.
