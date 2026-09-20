# Xarts Norma remediation — batch evidence

September 20, 2026. Supporting evidence for [Promote’s defense](../../defense.md).

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

