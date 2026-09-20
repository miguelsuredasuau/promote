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

User-supplied Xarts snapshot: **81/100 · 9 rulesets · 192 rules**, scan displayed as September 20, 2026, 10:48. This is the **pre-remediation, partial** scan: 2,324 issues remain in that snapshot, including four high security findings. The post-fix Xarts score and same-scope issue delta await a fresh scan; no score increase is claimed.

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
> We have a recorded scan–fix–rescan trail on Promote’s controller and an 81-point pre-fix Xarts snapshot. The new Xarts score still needs its rescan. The value is the repeatable workflow: evidence reaches the engineer, candidate reviews stay traceable, and accepted changes return to the product.

---

**Promote turns quality findings into accountable engineering work.**

Supporting evidence: [20-finding Xarts batch](docs/reviews/xarts-norma-batch-2026-09-20.md) · [real delivery](docs/xarts-video-loop.md) · [controller rescan history](docs/reviews/norma-remediation-2026-09-20.md) · [scope reconciliation](docs/reviews/norma-scope-reconciliation-2026-09-20.md).

Xarts source links require access to its private repository. This document is the project’s evidence-backed defense, not a Quality Clouds-issued certification.
