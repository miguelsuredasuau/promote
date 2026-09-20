# Xarts rescan: a small score gain, no broad reduction yet

The supplied follow-up dashboard reports **64/100 and 3,009 issues**. Security improved from **6% to 7%**, with **241 → 239 entries**. The overall issue count increased by five. This does not establish that the repository-wide cleanup succeeded.

These results concern **private `visx-anlak` (Xarts)**, the repository Promote maintains. They are not a score for the public Promote repository.

| Supplied dashboard | Earlier scan | Follow-up scan | Change |
| --- | ---: | ---: | ---: |
| Displayed time, September 20, 2026 | 11:23 | 12:24 | Timezone unspecified |
| Production-Ready Score | 63/100 | 64/100 | +1 |
| Total entries | 3,004 | 3,009 | +5 |
| Security | 6% · 241 | 7% · 239 | −2 entries |
| Architecture | 100% · 0 | 100% · 0 | 0 |
| Maintainability | 89% · 450 | 89% · 452 | +2 |
| Manageability | 72% · 956 | 72% · 959 | +3 |
| Performance | 98% · 90 | 98% · 90 | 0 |
| Scalability | 86% · 1,267 | 86% · 1,269 | +2 |

![Follow-up Norma dashboard: visx-anlak, 64/100, 3,009 issues, Security 7%](../images/norma-visx-anlak-rescan-2026-09-20.png)

## What actually changed in the exports

We compared every occurrence in the supplied `(1).json` and `(3).json` exports using a multiset key: rule ID, sorted file paths and whitespace-normalized snippet. Line numbers and provider finding IDs are not used as identity because they can change or repeat.

**2,995 matches persist; nine earlier matches disappear; fourteen new matches appear.** This is a textual comparison, not nine verified bug closures. Four additions occur in production paths already represented among the removals; ten additions come from the newly added inventory and triage tooling.

| Changed production path | Observed rule change |
| --- | --- |
| `index.html` | Missing CSP and missing referrer-policy matches disappear. |
| `render-cli/render.ts` | An async-error-handling match is replaced by another match in the same file. |
| `render-cli/file-renderer.ts` | An async-error-handling match disappears; the Promise.all warning remains at a changed snippet. |
| `charts/UIGallery/UIGallery.tsx` | The unsafe-href warning remains at a changed snippet. |
| `core/components/card/EmbedModal.tsx` | Empty-catch match disappears; an async-error-handling match appears. |
| `lib/captureSvgForAnnotation.ts` | One console-log-only match disappears. |
| `charts/ConceptWorkflow/ConceptWorkflow.tsx` | One unvalidated-URL-parameters match disappears. |

The ten tooling additions affect `scripts/quality/index-norma-export.mjs`, `docs/analysis/norma-security-triage.cjs` and `docs/analysis/norma-foreach-triage.cjs`. They remain in the totals; audit tooling is not automatically exempt from review.

The separate `(2).json` export contains **two agentic findings**. It is a separate evidence set and is not added to the 3,009 static entries or treated as part of this static delta.

## What this means for the remediation

The published batch at `ea935d03` passed **6,415 tests plus 66 SDK tests**, with 23 tests skipped. Those checks support behavior at that commit; they do not determine Norma's score. The new exports contain no source commit SHA or scan ID, so they cannot independently prove the exact revision scanned.

Earlier source reviews assessed **653 occurrences as false positives**: 236 security matches and 417 async-forEach matches. Those are documented engineering assessments of the earlier export, not 653 provider dismissals. They remain visible until Norma records an appropriate disposition or its detection changes. No broad reduction should have been inferred from that triage count.

The next work is to address the persistent rule families with reproducible examples, test real behavioral defects, and obtain provider-reviewed dispositions for misapplied rules. Modified code must be rescanned against an identified commit. A generic rewrite that merely changes the matching syntax is not evidence of a safer application.

The runtime objective remains **Promote dispatches → Devin returns a candidate → Promote independently verifies it → the office shows the same session and evidence**. This rescan alone does not demonstrate that loop; runtime session IDs and verification records must substantiate it separately.

[Sanitized comparison, source hashes and per-rule/path changes](xarts-rescan-comparison-2026-09-20.json) · [Earlier remediation and assessments](xarts-security-runtime-remediation-2026-09-20.md) · [Defense](../../defense.md)

Raw private exports and code snippets are not published. The dashboard is user-supplied; no fresh provider API retrieval was performed to prepare this comparison.
