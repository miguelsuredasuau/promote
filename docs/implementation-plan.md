# Implementation plan

The product promise is a feedback-driven, self-healing and self-improving codebase. The current implementation is a contract foundation. Each stage below requires observed evidence before its status becomes done.

## P01 — Independent foundation (verified)

Versioned schemas, synthetic scenarios, frozen acceptance identity, server/browser separation and legal transitions. Acceptance: a clean dependency install, typecheck and 70 contract tests pass without any target project checkout. Required gates cannot be removed or replaced by candidate-provided verdicts.

## P02 — Durable control plane (in progress)

Implemented first slice: SQLite incident intake, idempotency, transactional events, and create-session dispatch intent/claims. A crash after claiming must leave the operation held for reconciliation; lease expiry is never evidence that the provider did not create a session.

Acceptance: reopening the database preserves IDs and event ordering; duplicate intake with equal frozen inputs returns the same incident; conflicting use of a key fails; two workers cannot claim the same operation; wrong claim tokens cannot complete work; an unknown outcome cannot be claimed again.

Remaining slices: trusted request-to-incident construction, HTTP intake/snapshots/SSE, optimistic controls, persistent job scheduling, bounded retry/deadline policies, attempt and budget reservation ledgers. Do not expose raw incident records or internal dispatch mutation methods directly as public HTTP request schemas.

## P03 — Engineering harness and isolated runner

Depends on P01; integrates with P02. Implement Devin API creation, observations, feedback and confirmed cancellation behind the harness interface. Persist intent before network calls. Unsupported or ambiguous reconciliation blocks visibly. Budget units and observations retain their real provenance; unknown spend is never displayed as zero.

Runner executes allowlisted plans in disposable candidate environments. Original input and evaluator snapshots are immutable. Candidate processes cannot access controller credentials, alter authority, or publish releases. Timeouts and missing evidence are infrastructure outcomes.

Acceptance: a bounded real Devin session retrieves the configured base and submits a full candidate SHA; feedback continues work; unknown creation does not duplicate dispatch; remote and local termination are both verified. No credentials appear in exported evidence.

## P04 — First external project adapter

Depends on P01 and runner. Xarts is the first target, connected through configuration and an independently maintained adapter. Reproduction, numerical oracle, package consumption and output checks are domain-owned. The core has no Xarts import or dependency.

Acceptance: one actual or explicitly labeled seeded defect fails for the expected reason; invalid inputs are refused separately; held-out good/bad controls pass; original input remains unchanged. Engineering writes only to isolated candidate checkouts.

## P05 — Operator view

Depends on P01; live integration depends on P02. Build a branded isometric company/workshop view plus an accessible incident table and evidence inspector. Departments represent intake, engineering, verification and release. Display comes from recorded state, never invented progress animations.

Acceptance: scene/table agree; fixture/live/replay modes are explicit; keyboard and mobile inspection work; unknown cost and pending cancellation stay visible; replay cannot mutate operations. Branding and artifact rendering remain configurable.

## P06 — Real repair and release loop

Depends on P02–P04. An external trigger starts Devin, independent checks reject a candidate, failure evidence returns automatically, and a corrected candidate passes. Package the exact accepted commit, regenerate the original output using that package, then activate an atomic local release pointer.

Acceptance: no human code repair between rejection and correction; candidate/input/evaluator/profile identity matches; stale acceptance and late cancelled results cannot ship; failed regeneration preserves the previous release. Xarts main and package registries remain outside automatic demo destinations.

## P07 — Learning and controlled growth

Depends on P06. Convert validated user feedback and repeated failures into new incidents or proposed regression tests. Deduplicate feedback, retain provenance, and distinguish preferences from reproducible defects. Proposed validators need separate held-out evaluation and versioned adoption; they cannot authorize the candidate that proposed them.

Acceptance: a real feedback item yields a reproducible improvement and usable output; known-good behavior survives; a weaker proposed gate is refused. Capability growth is limited to one bounded, independently specified addition for the hackathon.

## P08 — Public demo and operational audit

Depends on P05–P06; P07 is stretch until the real repair loop works. Capture the real rejection/correction trace and final artifact. Test restart, duplicate triggers, timeout, cancellation, stale evidence and refusal. Clearly label replay and fault injection.

Publishing this repository does not certify these future stages as complete. Keep implementation status, README and evidence aligned. Review the Git publication set and run the public-source check before every push; raw provider transcripts, local configuration and runtime evidence are excluded by default.
