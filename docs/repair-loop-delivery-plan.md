# Delivery plan: one verified autonomous repair loop

Prepared 2026-09-19 after the orchestration audit. This document makes P02–P06 and P08 of `implementation-plan.md` actionable; it does not change their implementation status or authorize paid execution. P07 growth and the full P09 CEO workflow follow this milestone.

## Outcome

A chat observation becomes a reproducible incident. Promoted launches one engineering session within a configured mandate, independently evaluates its candidate, returns any failures for correction, builds the verified package, regenerates the original chart, and activates the package for subsequent chat requests. The office shows those same durable records and artifacts.

Completion requires an observed trace and usable output, not a green agent completion message or simulated office story.

## Scope and operating defaults

- One configured target project, one Devin engineering slot, one isolated evaluator slot, and a serialized local release queue.
- At most three candidate evaluations per incident. The actual deadline, per-session ceiling and aggregate spend ceiling must be configured before paid dispatch; example amounts are not authorization.
- Chat turns remain the chat application's responsibility. Their execution and spend must be labeled separately until central budget integration exists. Promoted supervises the engineering work arising from their observations.
- Release destination: local demo registry only. Target main and package registries are outside this milestone.
- Support repair, refusal and infrastructure outcomes first. Autonomous prioritization, multiple simultaneous engineering agents, new features and gate adoption are subsequent milestones.

## Ownership

| Workstream | Ownership | Boundary |
| --- | --- | --- |
| Backend/integrator | Promoted contracts, controller, provider adapter, runner, Xarts adapter, registry writer and integration tests | Sole owner of lifecycle, acceptance and release authority |
| Chat / current Claude work | Run records, durable outbox, registry consumer, original-request replay and chat process reliability | Observations are hints; chat cannot certify a library release |
| Visualization / current office work | Render authoritative incident, attempt, QA, budget and artifact projections | Does not reconstruct acceptance from hard-coded gate names or simulated state |

These are work assignments for coordination, not evidence that agents have been dispatched. Keep existing visual work intact. The backend owner currently owns the shared HTTP file; additions to its routes must be integrated with the office work rather than overwriting concurrent changes. No second owner should independently modify shared contracts.

## Milestone 0 — Agree and test the handoffs

Deliver shared versioned schemas and synthetic fixtures for:

1. Chat run records: producer/run identity, completion status, release identity, request/input hashes, signals and immutable artifact references.
2. Outbox import receipts: received, invalid/quarantined, triaged, incident-linked, acknowledged. Duplicate delivery must return the same receipt/incident; conflicting payloads must fail visibly.
3. Registry pointer and release envelope: strict release provenance plus explicitly versioned package metadata. The optional metadata envelope must be compatible with the core's strict Release schema.
4. Office projection: current incident/attempt, frozen profile, actual gate identities and grouping, accepted identity, authoritative stage status, connection freshness and artifact links.

Use content hashes and identifiers, not local machine paths, across these boundaries. Configure artifact roots locally and import verified bytes into controller-owned storage. Keep shared contracts consumable independently of Xarts source.

Exit: one producer fixture passes the consumer validation in each repository; malformed, stale and conflicting fixtures fail. Use actual Xarts catalog IDs in the QA test. Keep illustrative story fixtures explicitly separate.

## Milestone 1 — Execute a complete local controller loop

Build the trusted request-to-incident importer, transactional lifecycle changes with revision checks, persistent jobs/attempts, deadline/retry policy, capacity and budget reservations, and durable event records. Import outbox records only after atomic publication; persist ingestion receipt and resulting incident transactionally.

Bind session creation to a stable incident/session generation. Operation IDs alone do not prevent duplicate dispatch. Persist intent before external calls, keep unknown outcomes held, and expose reconciliation/recovery state. Apply the same care to feedback, cancellation and release effects.

Use a deterministic fake provider and runner to exercise the entire lifecycle before paid integration. They must be unmistakably labeled as test execution.

Exit: automatic intake → reproduction → engineering → rejection → correction → evaluation → local test release. Two workers, different operation IDs, duplicate outbox delivery, restart after send, expired lease, cancellation and deadline exhaustion never duplicate sessions or accept stale results. Failed activation retains the previous pointer.

## Milestone 2 — Prove real provider and isolated evaluation

Implement Devin start/inspect/feedback/cancel/reconcile against the existing harness interface. Verify current provider behavior while implementing. Where reconciliation is unsupported, hold the operation for explicit resolution rather than redispatching. Preserve reported/unknown cost provenance and reconcile cumulative usage without double counting.

Implement allowlisted execution plans in disposable environments with pinned runtime, read-only inputs/evaluator, resource limits and no controller or release credentials. Pin/fetch full candidate SHAs; reject protected-path changes. Persist logs and artifact digests outside candidate control. Confirm both remote and local cancellation before reporting termination.

Exit: under a configured ceiling, one real session retrieves the configured base and submits a candidate. The independent runner evaluates it and can deliver feedback. Timeout, missing evidence and runner failure cannot become a pass. Audit exported evidence for credentials.

## Milestone 3 — Repair the packaged-consumer path

Proposed first case: the SDK build/package consumption defects documented by the chat work. Reproduce the reported build failure at a pinned base and the installed-package failure independently before selecting the repair scope. These are reported findings until this runner reproduces them.

Use two linked repair scopes if needed: (a) SDK compilation, then (b) consuming/rendering the installed package without chat's `ts-loader` and `core-symlink` workarounds. Release is held until the full consumer path works. Do not broaden this incident into a general chart redesign or repair unrelated catalogue failures.

Freeze the baseline reproduction, representative original request and data, expected artifact/semantic checks, package-consumer checks and protected good/bad controls before engineering starts. Every accepted package must pass those same checks without runtime workarounds.

Exit: exact candidate builds, installs into a clean consumer, renders the frozen request and passes independent checks plus the scoped regressions. No human code repair between provider attempts. Preserve a genuine rejection/correction trace if it occurs; do not manufacture a bad candidate. If the first candidate passes, report that honestly and leave real rejection/correction acceptance unproven until observed on a suitable bounded case.

## Milestone 4 — Activate and observe the same result everywhere

Stage content-addressed package bytes and immutable release/manifest records. Reevaluate if the integration base changes. Regenerate the original output using the exact evaluated package, then atomically activate the pointer under the release lock. Record the prior release and reconcile crashes between pointer activation and database confirmation using a durable release operation identity.

Chat validates the full envelope, pins one release per turn, refuses an invalid activated release, and records the release used. Replaying the frozen original request verifies repeat benefit without another engineering session. Record shim removal as an observable improvement, not a substitute for semantic validation.

The office consumes the authoritative projection: real incident, attempt history, gate failures, correction, package/output identities and artifact comparison. Add paginated incident history and resumable event delivery or explicitly bounded polling; a global 100-event snapshot cannot be the sole QA evidence source.

Exit: the same incident, candidate, package and output can be followed across chat, controller and office. Reloading the office or restarting the controller preserves the outcome. Illustrative mode cannot mutate real work.

## Milestone 5 — Rehearse and record acceptance

Run a cross-repository suite at pinned revisions covering:

| Scenario | Required result |
| --- | --- |
| Duplicate input and multiple dispatch IDs | One incident and one authorized session generation |
| Crash after provider send, lost response | Held/reconciled; no blind paid retry |
| Rejected candidate | Structured feedback; bounded automatic correction |
| Cancellation during engineering/evaluation/release | Confirmed termination or visible pending state; no late release |
| Changed input/profile/evaluator/base | Old evidence cannot authorize the changed work |
| Missing data or unsupported semantics | Evidence-backed refusal, no fabricated output |
| Failed package install/regeneration/activation | Prior release preserved; clear failure |
| Broken activated release | Chat refuses; no silent fallback |
| Restart and office reconnect | Correct current state and available historical evidence |
| Original request after release | Correct output from the activated package; no new repair session |

Attach test commands/results, repository revisions, incident/session/attempt identities, evaluated manifest, package/output hashes and a sanitized trace to milestone evidence. Update implementation-status.json only for the stages actually demonstrated.

## Sequencing and checkpoints

Milestone 0 comes first. After its contracts are frozen, chat and office integrations can advance independently while the backend completes milestones 1–3. Registry activation and integrated office validation converge at milestone 4; milestone 5 is the release readiness check.

Use three owner-visible checkpoints: a local fault-tested loop; a real evaluated candidate; and the integrated released-chart rehearsal. Estimate remaining duration after the local loop and provider/runner spike: provider repository access, evaluator provisioning and real candidate behavior are unresolved dependencies, so a fixed 24-hour promise would be premature.

Local implementation and tests can proceed now. Before the first paid run, configure the explicit provider mandate and spend ceilings. This planning request does not activate a numeric budget. If a provider cannot enforce a ceiling, expose that limitation in policy rather than describing the run as hard-capped.

## Follow-on: multiple duties

After the first verified loop, add versioned proposals and task dependencies, priority/fairness, scoped mandates, per-project conflict detection and centralized budget allocation. Expand from repairs to regression proposals and one independently specified capability. Increase engineering concurrency only after competing candidates, cancellation and serialized release are tested. Owner approvals for substantial investments bind exact proposal revisions; no approval changes a failed technical verdict into a pass.
