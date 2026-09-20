# Promote × Norma — quality inside the agent loop

**An audit tells you what needs fixing. Promote puts an engineering team on it.**

Promote gives your repository an AI CEO: user feedback becomes scoped work, Devin proposes a change, and an independent controller checks the candidate before delivery. Norma is embedded in that workflow—both in Devin’s engineering instructions and in Promote’s candidate review.

**The submission is Promote. The real project it maintains is Xarts (`visx-anlak`).** Built for Hackbarna 2026, September 19–20.

## The difference: quality travels with the change

A repository audit is valuable evidence about a moment in time. An autonomous engineering system needs that evidence at the moment an agent proposes its next change—and again when the next candidate arrives.

Promote connects those two needs. Instead of leaving a developer to translate an audit into work and reconcile the result, it provides the engineering workflow around the review:

| Embedded capability | Practical benefit |
| --- | --- |
| **Norma instructions inside Devin’s task** | The engineer is instructed to load applicable rules, review changed files, fix and recheck, and return a structured quality report. |
| **A separate controller review** | Promote reads the frozen candidate’s Git blobs and calls Norma independently. The coding agent’s assessment is not its own release approval. |
| **Commit and file-hash binding** | Findings belong to the exact candidate being considered, rather than an ambiguous “latest version.” |
| **Persisted evidence in the activity journal** | Findings, coverage, provenance and blockers remain available alongside the engineering work. |
| **Build, behavioral and consumer gates** | Static review sits alongside executable evidence that the resulting package works. Failed mandatory checks inform the next engineering attempt. |
| **Scope and budget boundaries** | Quality work stays within the authorized task; a finding does not grant permission to rewrite the repo or spend without limits. |

**The differentiator is the integration: quality review becomes a repeatable part of agent-driven maintenance, beyond a one-off hackathon audit.** The current implementation is candidate-based; it does not automatically turn every Norma finding into a new paid task.

```mermaid
flowchart LR
    Signal["User feedback / errors"] --> Task["Scoped task + budget"]
    Task --> Devin["Devin + Norma review instructions"]
    Devin --> Candidate["Candidate commit"]
    Candidate --> Review["Promote: independent Norma review"]
    Review --> Gates["Build + behavior + consumer checks"]
    Gates -->|"Failed mandatory checks"| Task
    Gates -->|"Accepted under release policy"| Release["Verified package → application"]
    Review -.-> Journal["Commit-bound findings + coverage journal"]
```

Implementation: [Devin instructions](prompts/engineer-v4.md) · [candidate delivery pipeline](server/xarts-delivery.ts) · [independent Norma client](server/norma-review.ts) · [integration details](docs/integrations/norma.md).

## Working software, with evidence

**A chart bug became a delivered library repair.** Xarts displayed negative currency labels as `€-110.3k`. Promote dispatched a real Devin session, independently verified the returned package, activated it in the local registry, and replayed the original SQL-backed chart through Xarts Chat. Same data; correct `-€110.3k` labels; zero workarounds in the replay. [Recorded delivery, hashes and before/after images →](docs/xarts-video-loop.md)

**Norma findings led to concrete reliability improvements.** In the latest Xarts batch, 20 findings were reviewed: 17 received contextual changes and three were retained with explicit reasoning. Users now receive feedback when export or annotation capture fails; a failed capture cannot trigger navigation. PDF failures retain their original cause, font fallback reports degraded lookup, and diagnostic scripts report failure and clean up resources. **58 targeted tests pass.** [Batch evidence and commit →](docs/reviews/xarts-norma-batch-2026-09-20.md)

**Scan → fix → rescan is recorded on Promote itself.** The same six-file controller scope went from **47 → 39 → 35 → 0 reported findings** across retained reviews. The final result was consolidated with hash-verified unchanged files and remained pending because rule coverage was reduced. [Audit trail →](docs/reviews/norma-zero-findings-2026-09-20.md)

These demonstrate complementary parts of the use case: a real engineering-and-delivery loop, code improved using Norma, and a retained rescan trail. The Xarts batch was applied with Codex; Norma was unavailable in the recorded Devin currency-sign session. Neither is presented as a completed end-to-end Norma-in-Devin demonstration.

## One finding fixed. One decision defended.

**Fixed: failed preview actions lacked useful feedback.** We added an error boundary around export and annotation capture. It reports the problem and permits success-only actions only after completion. Tests cover synchronous throws, rejected promises and successful continuation. The benefit is visible to the user: an actionable failure instead of a silent rejection.

**Accepted: an await inside an async PDF test.** Vitest already catches rejected test promises and fails the test. A local catch that logs and continues would weaken that gate. We preserved fail-fast behavior. Two CLI findings likewise already reached a top-level error handler; regression checks confirm a nonzero exit on missing input.

**The engineering decision is to improve behavior—not simply remove warning-shaped code.**

## The dashboard

![Norma dashboard for visx-anlak: 81/100, partial coverage, 2,324 issues](docs/images/norma-visx-anlak-2026-09-20.png)

The image above is **historical**: the supplied partial scan displayed **81/100 and 2,324 issues** at September 20, 2026, 10:48. The **newer supplied dashboard** displays **63/100 and 3,004 issues**, with **Security at 6% (241 entries)**, at 11:23. We have not independently retrieved a newer score. The drop is not presented as improvement, and the totals alone do not establish which code changes or scan differences caused it.

### Current investigation: fix the causes, verify the signal

We parsed the complete 3,004-entry export. **Six repeated rules account for 2,620 entries (87.2%)**, making shared-cause remediation more useful than 3,004 mechanical edits. This is an inventory analysis, not a completed review of every finding.

| Observed evidence | Engineering response |
| --- | --- |
| 3,004 entries across 933 paths, but only 2,699 distinct provider IDs | Preserve every occurrence. IDs are reused across locations, including live code and historical copies; deduplicating only by ID would lose work. |
| Some “open redirect” matches are array `.push()` calls; some “async forEach” matches have synchronous callbacks | Check receiver and callback types before proposing a repair. These examples do not establish that every match in either family is false. |
| Initial review of the 20 high-security entries assesses 16 as contextual false positives | Examples include design-token names, per-tab PNG captures, deliberately invalid connection-string fixtures, and dedicated-worker messages. This is our assessment, not a provider-confirmed dismissal. |
| Three image renderers accept URLs beyond their documented embedded-image contract; production preview lacks CSP | Local changes restrict those image sources and add a production policy. Capture payload validation is also strengthened. These changes are not yet a published repair or verified Norma closure. |
| 54 targeted image/storage and spreadsheet tests, TypeScript and production build passed | Behavioral evidence supports the local changes; it does not establish a clean repository, a new dashboard score or complete browser compatibility. |

**Why this belongs in the runtime:** an autonomous engineer must distinguish a real defect from a misapplied rule, test the repair and retain the reasoning. Otherwise, increasing autonomy just accelerates unnecessary rewrites. Our next implementation milestone is a complete finding ledger and scoped remediation tasks; automated dispatch of the entire scan is not implemented yet.

[Repository-wide remediation plan →](docs/reviews/xarts-repository-remediation-plan.md) · [Export counts and provenance →](docs/reviews/norma-xarts-export-summary-2026-09-20.json)

Norma currently runs in **advisory mode**. Missing authentication or incomplete coverage stays pending, while mandatory release gates retain authority. The independent review is bounded to ten changed source files per candidate, not a full-repository scan. [Coverage and operating limits →](docs/integrations/norma.md)

## The two-minute defense

> Coding agents made it faster to change software. Promote adds the management and verification needed to keep improving it.
>
> Our distinctive use of Norma is to embed it in that engineering workflow. Devin receives quality-review instructions with its task. When it returns a candidate, Promote performs its own review against the exact commit, records the evidence, and keeps build and behavioral checks in control of delivery. That makes quality part of the next change, not just a report produced at the end of the hackathon.
>
> Xarts is our real proving ground. Promote took a currency-label bug through a Devin repair, independent verification, local package release and replay in the application. Separately, our latest Norma batch improved export feedback, PDF error reporting and diagnostic cleanup, with 58 targeted tests passing.
>
> One fix prevents a failed annotation capture from navigating away without useful feedback. One accepted finding preserves an async test’s rejected promise: the test runner already treats that as failure, so catching and continuing would make the check worse.
>
> We have a recorded scan–fix–rescan trail on Promote’s controller. Xarts’ newer supplied dashboard is 63/100 with 3,004 entries; we are reconciling that export and repairing confirmed defects, without claiming it is clean. The value is the repeatable workflow: evidence reaches the engineer, candidate reviews stay traceable, and accepted changes return to the product.

---

**Promote turns quality findings into accountable engineering work.**

Supporting evidence: [20-finding Xarts batch](docs/reviews/xarts-norma-batch-2026-09-20.md) · [real delivery](docs/xarts-video-loop.md) · [controller rescan history](docs/reviews/norma-remediation-2026-09-20.md) · [scope reconciliation](docs/reviews/norma-scope-reconciliation-2026-09-20.md).

Xarts source links require access to its private repository. This document is the project’s evidence-backed defense, not a Quality Clouds-issued certification.
