# Defend your code — Promote × Norma

Hackbarna 2026 · September 19–20 · Prepared from retained evidence on September 20, 2026.

**Verdict:** documented scan → fix → rescan, with a measurable reduction in a bounded code-review scope. This is not a repository-wide production-readiness certification. Broader findings and incomplete rule coverage remain outstanding.

## Two-minute explanation

> Promote gives a repository an AI engineering team, while an independent controller checks what the agents produce. That controller is important code: it handles paid sessions, durable evidence and release decisions. We used Norma to review it.
>
> One finding we fixed was nested conditional logic in the Devin adapter's session-status classification. Those expressions made precedence difficult to inspect—for example, when a finished session still carried an older activity detail. We replaced them with explicit branches and added eleven status/detail cases covering terminal, waiting, running and unknown states. We did not change rules or suppress findings. Across the same six reviewed files, the first before-and-after scans recorded 47 and 39 findings; the report links both commits and file hashes. That is eight fewer static matches, not eight proven production bugs.
>
> One finding we consciously accepted was the warning about sequential awaits. Evidence receipts and claimed work must preserve order. Starting everything concurrently just to silence a performance warning could change what is persisted or dispatched after a failure. We retained sequential execution. Later we made that decision explicit with a capacity-one queue and tested that only one operation runs at a time and that failure prevents subsequent work from starting. The static warning disappeared after that refactor, but the deliberate tradeoff remains: correctness and bounded work ahead of maximum throughput.
>
> Later retained checks reported zero findings for ten named files, including the original six. However, one Semgrep rule could not run, so our review stays pending. The broader dashboard and prompt-analysis export still contain outstanding issues. Our claim is a traceable improvement with tested behavior—not that the whole repository is clean.

## 1. Production-Ready Score

| Evidence | Recorded result | What it establishes |
| --- | --- | --- |
| User-supplied full-scan dashboard, September 20 at 07:52; timezone unspecified | **55/100; 450 issues** | Historical dashboard observation, not a freshly retrieved final score. |
| Supplied AI-findings export | **121 unique findings** | 118 prompt-analysis and 3 agentic findings across 15 paths; no frozen source commit or scan ID supplied. |
| Retained source Livechecks | **0 final reported findings in ten files; coverage reduced** | Bounded source results, consolidated using unchanged-file hashes; advisory status remains pending. |

**Final full-repository score: not verified.** The 121, 450 and zero counts refer to different evidence sets. Do not subtract them, combine them or present zero as the dashboard score.

Project dashboard: [Norma project 10114 — AI findings](https://norma.qualityclouds.com/projects/10114/ai-findings). The dashboard could not be accessed through the browser tool used to prepare this document. No new provider scan or dashboard export was performed for this document.

See the [scope reconciliation](docs/reviews/norma-scope-reconciliation-2026-09-20.md) and [issue inventory](docs/reviews/norma-scope-reconciliation-2026-09-20.json).

## 2. Scan → fix → rescan audit trail

| Stage | Commit | Recorded findings | Evidence |
| --- | --- | ---: | --- |
| Baseline: six source/test files | `aa0898e` | 47 | [Before/after records](docs/reviews/norma-remediation-2026-09-20.json) |
| Explicit status/error branches | `ff6d673` | 39 | [First remediation](docs/reviews/norma-remediation-2026-09-20.md) |
| Remaining nested classifications simplified | `c2c8af6` | 35 | [Second pass](docs/reviews/norma-round2-2026-09-20.md) |
| Input validation, error boundaries and explicit ordered work | `caa1e98` | 0 retained across ten files, including the original six | [Final bounded report](docs/reviews/norma-zero-findings-2026-09-20.md) and [structured evidence](docs/reviews/norma-zero-findings-2026-09-20.json) |

All stages report reduced coverage. The provider engine was not pinned. The last result combines a ten-file review at `4acc475` with rechecks of two changed files at `caa1e98`; the other eight files were hash-verified unchanged. It is not a claim that all ten were rescanned at the final commit.

The retained records substantiate the challenge's scan/fix/rescan sequence through MCP. A fresh full scan is still needed to supply a comparable final repository score.

## 3. One finding fixed

**Finding:** nested conditional classification in `adapters/devin/client.ts`.

**Change:** replace nested session-status expressions with explicit branches; make terminal-state precedence readable and preserve the intended classification.

**Validation:** eleven status/detail cases; the first remediation checkpoint passed public-source checks, TypeScript and 242 tests, with five skipped. The same-scope rescan recorded fewer nested-conditional matches. The 47 → 39 delta includes changes in intake as well as the adapter; it is not attributed solely to this one expression.

**Evidence:** [first-pass implementation and tests](docs/reviews/norma-remediation-2026-09-20.md), [per-file rules and locations](docs/reviews/norma-remediation-2026-09-20.json).

## 4. One finding consciously accepted

**Finding:** await-inside-loop / sequential-await warnings; eleven such matches remained in the first-pass triage.

**Decision:** retain ordering for durable evidence writes, provider observation/cancellation and claimed work. Do not introduce unbounded parallelism to improve a static score.

**Tradeoff:** lower throughput than unconstrained parallel work; simpler ordering and bounded in-flight operations. A measured bounded-concurrency design could be considered later for demonstrably independent operations.

**Controls:** the later capacity-one queue starts work lazily, preserves order and stops starting later work after an uncaught failure. Behavioral tests cover synchronous throws, rejected promises, empty queues, stable ordering and one active operation at a time.

**Status:** a historical finding consciously accepted on behavioral grounds, then refactored for explicitness. The final retained source checks no longer report it. This is not an outstanding provider exception or a finding dismissed through the Norma UI. If judges require an *open* accepted finding, present that distinction and obtain a reviewed disposition against a current scan rather than inventing one.

**Evidence:** [recorded original triage](docs/reviews/norma-remediation-2026-09-20.md), [ordered-work implementation and test evidence](docs/reviews/norma-zero-findings-2026-09-20.md).

## 5. Remaining work and limits

- Refresh the full scan and capture its scan ID, source SHA, timestamp/timezone, filters and final score. Compare like-for-like scopes.
- Recheck the shared-module extraction and Studio session-bootstrap changes. They are implemented, but the [reconciliation](docs/reviews/norma-scope-reconciliation-2026-09-20.md#first-implementation-follow-up) does not claim provider-confirmed closure.
- Triage active prompt findings against complete requests, including API schemas and actual model inputs. Historical prompts and active prompts are distinct; neither is automatically exempt.
- Resolve the unavailable rule with Norma. Incomplete coverage must remain visible.
- Keep mandatory build, behavioral and consumer checks independent. Norma is advisory; an unavailable review is not a passing review or release authorization.

The Xarts currency-sign repair is separate product evidence. It completed verification and local release, but Norma was unavailable in that Devin session; do not credit it as a Norma-approved repair. See the [recorded delivery](docs/xarts-video-loop.md).

## Presentation checklist

1. Open the first-pass before/after records and show the same six-file scope.
2. Explain the adapter fix and its behavioral tests.
3. Explain the intentional sequential-work tradeoff and its current status.
4. Show the coverage warning and the outstanding full-scan score honestly.

Prepared by the project from retained Norma evidence. This is not a Quality Clouds-issued verdict, a security certification or a fresh scan. No secrets, raw private prompts or local database contents are included.
