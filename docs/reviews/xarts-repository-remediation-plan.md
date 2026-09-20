# Xarts: repository-wide remediation plan

Prepared September 20, 2026. Status: **planned; initial security changes in the local working tree**. This is the implementation plan, not a claim that the repository is clean.

## Target

Account for every one of the 3,004 exported occurrences. Fix confirmed defects at their shared cause, preserve chart output and public contracts, and make subsequent Devin work pass the same checks. No finding disappears merely because its rule is noisy or its file is a test.

Completion means zero **untriaged** baseline occurrences, zero unresolved confirmed high-risk defects, and a comparable full rescan. Remaining accepted tradeoffs and provider disagreements must stay visible. Zero static matches is not a substitute for those outcomes.

## What the full export shows

The export contains **3,004 entries across 933 paths and 30 rules**. Six rules account for **2,620 entries (87.2%)**:

| Repeated rule | Entries | Review the underlying behavior |
| --- | ---: | --- |
| Async operation without error handling | 671 | Trace the rejection to its owning UI, CLI, worker or test boundary. Add handling where failures actually escape or look successful. |
| Console logging | 544 | Distinguish intended CLI output from inadequate runtime diagnostics and sensitive logging. |
| Async `forEach` | 420 | Determine whether the callback actually returns a promise. Synchronous callbacks are not async defects. |
| Nested ternary | 408 | Extract clear branches for complex decisions; preserve precedence and chart output. |
| `any` usage | 396 | Prioritize untrusted inputs and public contracts; replace with validated types or `unknown` plus narrowing. |
| Open redirect | 181 | Resolve the receiver: array mutation is not browser navigation. Validate destinations at genuine navigation sinks. |

Other priorities include 133 sequential-await findings, 40 state updates in effects, 39 URL-parameter findings, 14 nested linear searches, 13 empty catches, four fetches without timeouts and two unbounded Promise.all findings. [All counts and provenance →](norma-xarts-export-summary-2026-09-20.json)

**Identity problem:** 3,004 entries have only 2,699 distinct provider IDs. Seventy-two IDs are reused, producing 305 extra occurrences. Some identify both live code and historical copies. Even `(rule, path, line)` yields 2,999 distinct keys. Neither provider ID nor location is sufficient as a unique ledger key. Retain every export occurrence with its index and export hash; link related entries without discarding them.

The export does not provide a frozen source SHA or scan ID. Links to `main` are mutable. A current file hash can bind our review, but cannot retroactively establish the scan's original source commit.

## Execution sequence and dependencies

| Work package | Depends on | Deliverable and acceptance |
| --- | --- | --- |
| W00 — Baseline and finding ledger | None | Preserve export hash; assign occurrence IDs; record rule, severity, file, line, source match, current source SHA/hash and disposition. Capture baseline tests and known failures. Every entry accounted for. |
| W01 — Security boundaries | W00 | Review all 241 security entries, high severity first. Test image and navigation sinks, CSP, credentials, storage and worker boundaries. No speculative origin checks on dedicated workers. Every confirmed defect has a regression test. |
| W02 — Error ownership and diagnostics | W00 | Trace 671 async and 13 empty-catch findings; classify 544 logging entries. Standardize contextual CLI failure/exit, user-facing error state and resource cleanup where useful. Never catch-and-continue to silence a rule. |
| W03 — Async scheduling and resource bounds | W02 | Classify all 420 forEach, 133 ordered-await and two Promise.all findings. Keep dependency ordering; use bounded concurrency only for independent work. Test maximum in-flight work, failures, cancellation and cleanup. |
| W04 — Types and deterministic logic | W00, shared contracts from W01–W03 | Replace unsafe boundary `any`, simplify complex decision trees, then tackle repeated chart implementations. Avoid `as unknown as T`, blanket suppressions or abstractions that just relocate warnings. |
| W05 — React lifecycle and performance | W01, W04 | Inspect effect dependencies, derived state and cleanup; fix repeated work only after reproduction or measurement. Test render/update/unmount behavior and benchmark representative large datasets. |
| W06 — Historical evidence and generated code | W00; accompanies all packages | Separate active runtime, executable diagnostics, tests, generated output and immutable snapshots. Fix generators before regeneration. Preserve historical evidence rather than rewriting it to manufacture clean history. |
| W07 — Autonomous maintenance integration | W00 ledger contract; W01–W03 proven patterns | Add finding-to-task reconciliation, priority, budget admission, bounded dispatch, retry limits and UI visibility to Promote. Existing candidate review alone does not implement this. |
| W08 — Full verification and publication | W01–W07 | Run required build, behavior, golden and consumer checks; rescan with matching rules and scope; publish exact deltas and remaining dispositions in defense.md. |

## How to batch changes safely

1. **Inventory before automation.** Use TypeScript AST/type information to identify array `.push`, promise-returning callbacks and actual URL sinks. Record uncertainty where JS or dynamic dispatch prevents proof.
2. **Prove each family once.** Manually inspect contrasting examples: runtime, CLI, test and historical copy. Build a failing behavioral test for a real defect, then implement a small reference repair.
3. **Expand within a bounded scope.** Start with one subsystem and at most ten changed source files per task, matching the current independent review limit. Larger tasks require explicit review sharding; never silently leave files unchecked.
4. **Change the origin.** Where chart code comes from templates or generators, repair those first and regenerate. Shared helpers need narrow contracts; do not invent a framework around simple synchronous code.
5. **Verify before scaling.** Review the diff and check contracts, deterministic output and failure behavior. Only then apply the established pattern to another batch.

High-volume files are investigation priorities, not automatic rewrite targets: `render-cli/deriva-metadatos.ts` has 134 entries; `revisa-pantalla.ts` 56; SDK consumer checks 55; overflow/gap checks 45 each. Chart paths contribute 1,129 entries, CLI paths 981 and docs 348. These are occurrence counts, not rankings of actual risk.

## Finding ledger and closure rules

Each occurrence retains: export identity, provider ID, rule/version, path/line, snippet hash, source match status, reviewed commit/file hash, owning subsystem, disposition, rationale, repair commit, tests, rescan receipt and related occurrences.

Allowed dispositions:

- **Untriaged / investigating:** not yet established; never counted as resolved.
- **Confirmed defect:** queued, in progress or locally fixed with tests.
- **Contextual false-positive assessment:** exact expression and runtime behavior explain why the rule does not apply. Keep reviewer rationale and provider disposition separate.
- **Accepted tradeoff:** actual behavior is intentional; record consequences, compensating checks, owner and revisit condition.
- **Historical / generated copy:** linked to its origin; this is a scope classification, not an automatic exemption.
- **Provider closure verified:** comparable rescan no longer reports the original issue; require commit, scope and coverage evidence.

A changed line number or provider ID is not closure. Match by rule, file, syntax context and change history. If coverage disappears, the result is pending, not passed.

## Validation gates

- **Security:** adversarial URL/protocol inputs, persisted-data validation, browser-enforced CSP, no secret-bearing logs; preserve valid embedded images and annotation behavior.
- **Errors:** rejected promises and synchronous throws reach the correct boundary; failed operations cannot produce success navigation, output or release; resources are released.
- **Concurrency:** bounded active work, no lost rejection, cancellation/timeouts where applicable, stable ordering for dependent writes.
- **Library:** typecheck, relevant unit tests, SDK build and consumer checks; deterministic SVG/goldens for chart changes. Do not update golden baselines merely to get a pass.
- **Generated catalogs:** regenerate from source and run corresponding `:check` commands; do not edit generated JSON as the repair.
- **Evidence:** before/after source identity, actual commands/results and scan coverage. A missing Norma review remains advisory/pending and never authorizes release.

Failures return to the task with the actual failed assertion and evidence. Stop repeated ineffective retries, overlapping edits, scope expansion and exhausted budgets; escalate the concrete blocker.

## Promote operating changes to implement

The office settings should expose pause/resume, review cadence, daily and per-session budgets, concurrency, maximum attempts, target repos, allowed paths and approval thresholds. The safe displays reserved versus observed spend; missing costs remain unknown.

The heartbeat should reconcile open work and recent failures before dispatching. It should ingest current scan receipts, logs and explicitly enabled sandbox exploration into deduplicated tasks. Increasing heartbeat frequency alone will not repair an expired mandate or create an authorized backlog.

The backlog should distinguish repair, investigation, regression test and accepted finding. Show the reason a task is not running: no authorization, budget reserved, dependency, provider unavailable or repeated failure. Exploratory Devin testing may discover new incidents; independent reproducible checks remain the release gate.

## Reporting and final rescan

Track confirmed defects fixed, regressions prevented, justified false-positive assessments, accepted risks, untriaged occurrences, coverage, paid work and actual cost separately. Do not report “warnings removed” as “bugs fixed.”

The supplied dashboards changed from **81/100, PARTIAL, 2,324 issues** to **63/100, 3,004 issues, Security 6%**. Neither a causal regression nor improved coverage can be established from those totals alone. Reconcile scan inputs, rules, coverage and source commits first.

Every completed batch updates defense.md with a short verified outcome and links to detailed evidence. The final score must come from a fresh full scan, with the same scope/rules or an explicit reconciliation. Never promise 100/100 in advance.
