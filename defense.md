# Defend your code — Promote improving Xarts

**Submission: Promote. Maintained project: Xarts (`visx-anlak`).** Hackbarna 2026, September 19–20.

Promote turns user feedback and errors into scoped engineering work, dispatches Devin, independently checks candidates, and delivers accepted packages. This defense shows both the real Xarts repair loop and how Norma findings guide improvements to the maintained repository.

## Norma dashboard evidence

![User-supplied Norma dashboard for visx-anlak: 81/100, partial scan, 2,324 issues, and a failing security area](docs/images/norma-visx-anlak-2026-09-20.png)

**Latest supplied dashboard snapshot: 81/100, 2,324 issues, 9 rulesets and 192 rules.** The screenshot displays a scan time of **September 20, 2026, 10:48**, with **PARTIAL** coverage. Its timezone, scan ID and source SHA are not visible. This is user-supplied evidence, not a fresh API retrieval.

| Area | Score | Issues |
| --- | ---: | ---: |
| Architecture | 100% | 0 |
| Maintainability | 89% | 450 |
| Manageability | 83% | 559 |
| Performance | 99% | 44 |
| Scalability | 86% | 1,267 |
| Security | 59% · FAIL | 4 high |

The provider displays a “CERTIFIED” badge, but also partial coverage and a security failure. We reproduce the screenshot faithfully; we do not interpret the badge as zero risk or complete acceptance. **This snapshot predates the remediation below; the post-remediation score is pending.**

## What was already delivered

| Work | Evidence | Attribution and limits |
| --- | --- | --- |
| Waterfall currency signs: `€-110.3k` → `-€110.3k` | Candidate `cde20023`; merged as `c95e48bd`. [Recorded delivery and replay](docs/xarts-video-loop.md) | Real Promote → Devin → independent verification → local package registry → Xarts Chat replay. Same data; corrected labels. Norma was unavailable in that Devin session. |
| Restrict renderer output directories to the permitted root | [Commit 9ec151f4](https://github.com/miguelsuredasuau/visx-anlak/commit/9ec151f4), merged through PR #45 | Existing repository hardening, with containment tests; not newly fixed by this batch or proven to close one of the four dashboard security findings. |
| Host/origin checks on render requests | [Commit 97d714d1](https://github.com/miguelsuredasuau/visx-anlak/commit/97d714d1) | Existing repository hardening. No same-scan Norma closure claimed. |
| Restrict card illustrations to allowed assets/data URIs | [Commit 5fd4a5a7](https://github.com/miguelsuredasuau/visx-anlak/commit/5fd4a5a7) | Existing repository hardening; distinct from the new PDF error-context change. |
| Bound editorial input and improve line-wrapping complexity | [Commit 428ece5d](https://github.com/miguelsuredasuau/visx-anlak/commit/428ece5d) | Existing bounded-input/performance work. Do not attribute the screenshot's score to this change without comparable scans. |

Xarts is a separate private repository; its commit links require access. This public defense contains summaries and the supplied dashboard, not the private source.

## Latest remediation: the supplied 20-finding batch

**Implemented in Xarts commit [4de83485](https://github.com/miguelsuredasuau/visx-anlak/commit/4de83485)** by GPT-6 via Codex, following the user-supplied Norma recommendations. This batch was handled directly in the coding assistant, not dispatched through a new Promote/Devin session. Each implementation change includes the requested `Recommended by Norma — fixed with GPT-6 via Codex` comment.

The 20 entries cover 13 files. **17 entries received contextual fixes; three were reviewed and consciously retained because their errors already reach an owning failure boundary.** This is implementation triage, not 17 provider-confirmed issue closures.

| File | Entries | Disposition |
| --- | ---: | --- |
| `docs/analysis/evidence/2026-09-09-contract-coverage/check-report.mjs` | 2 | Added a CLI failure boundary and guaranteed browser cleanup after browser creation. |
| `cards/export/pdf.ts` | 2 | Page/navigation/font-readiness failures reject with a useful operation message and the original cause. No incomplete output is returned. |
| `core/layout/medirTexto.ts` | 1 | Failed CSS lookup emits a bounded, once-per-module warning while preserving the fallback measurement path. |
| `docs/analysis/evidence/2026-09-09-contract-coverage/inspection.mjs` | 2 | Added contextual CLI reporting and a nonzero failure exit. |
| `docs/analysis/evidence/tooltip-installed-negative.mjs` | 4 | Added a CLI failure boundary; initialization is inside cleanup protection; nested cleanup restores globals even if unmount/close fails. |
| `docs/analysis/evidence/2026-09-09-contract-coverage/roundtrip.mjs` | 1 | Added an outer failure boundary for setup and persistence; expected per-fixture rejections remain recorded as diagnostic outcomes. |
| `playground/PlaygroundPage.tsx` | 2 | Export/capture errors reach the existing visible alert; failed capture does not navigate. |
| `core/runtime/cli.ts` | 1 | Accepted: existing `main().catch(...)` reports failure and sets exit code 1. A regression check confirms missing input fails. |
| `render-cli/qa-html.ts` | 1 | Accepted: existing top-level catch reports failure; `finally` closes the Vite server. Missing-input failure is regression-tested. |
| `docs/analysis/probes/react-interaction-preparation.mjs` | 1 | Added an outer CLI failure boundary; expected preparation/render rejections remain in the diagnostic report. |
| `docs/analysis/probes/symbolmap-external.mjs` | 1 | Added a CLI failure boundary; missing-package failure is regression-tested. |
| `docs/analysis/probes/icicle-presentation-golden.ts` | 1 | Added a CLI failure boundary and guaranteed Happy DOM cleanup after creation. |
| `cards/__tests__/pdf.test.ts` | 1 | Accepted: Vitest owns rejected async test promises and fails the test. Catching and continuing would weaken the gate. |

**Validation:** 58 passing tests across `normaErrorBoundaries`, `medirTexto`, and the existing card PDF suite. Checks exercise rejected and synchronously thrown UI actions, success continuation, page/font failure causes, fallback diagnostics, CLI failure exits, and physical PDF behavior. Modified `.mjs` files pass syntax checks. Historical evidence scripts depending on an external installed consumer/catalog were not rerun against their full datasets; their archived result files were not rewritten.

## Two-minute defense

> Promote is the project we are submitting. Xarts is the charting library it maintains. The useful outcome is working software: Promote dispatched a real chart-label repair to Devin, independently verified the returned package, delivered it to a local registry and replayed the original chart with identical data and corrected signs.
>
> We also use Norma to guide code review. The supplied Xarts scan shows 81 out of 100, but it is partial and still reports security findings. We do not call that a clean bill of health.
>
> In the latest 20-finding batch, one issue we fixed was missing error feedback in the Playground. Export or annotation capture could reject without a useful message. We added a shared UI error boundary, retained diagnostic logging, and only perform success actions after the operation completes. Failed capture no longer navigates away. Tests verify both rejected promises and synchronous throws, and that a successful action can still proceed.
>
> One finding we consciously accepted was an await inside a PDF test. Vitest already catches rejected test promises and marks the test as failed. Adding a catch that logs and continues could turn a real failure into a passing test. Similarly, two CLI findings already have a top-level handler and nonzero exit; we verified their failure behavior instead of adding redundant catches around every await.
>
> The batch has 17 entries with contextual changes and three documented exceptions. Fifty-eight targeted tests pass. These are implemented improvements, not a claimed reduction of 17 in Norma's dashboard. A fresh comparable scan must establish the new score and issue delta.

## Remaining challenge evidence

- **Final post-fix Xarts score:** pending. The saved Norma OAuth access token was expired when inspected; no new Xarts scan is claimed here.
- **Issue delta for this Xarts batch:** pending a rescan tied to the candidate SHA and the same rule/scope configuration. Preserve issue IDs and disposition; do not subtract local triage from the dashboard count.
- **Four high security findings:** still require their actual finding details and contextual review. This supplied batch does not identify them.
- **Full historical probes:** require their installed SDK/catalog/browser fixtures; syntax and failure-path tests do not substitute for those runs.
- **Existing scan/fix/rescan evidence on Promote itself:** retained below, separately scoped. It demonstrates use of Norma during the event, but does not establish a Xarts rescan or combine the two projects' scores.

<details>
<summary>Earlier scan → fix → rescan evidence: Promote's own controller</summary>

# Earlier evidence: Norma reviewing Promote itself

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

</details>
