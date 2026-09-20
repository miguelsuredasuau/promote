# Xarts security and runtime remediation

September 20, 2026. The full export has 3,004 occurrences across 933 paths. This report describes a bounded implementation and source review, not a completed clean-up of all 3,004 occurrences or a new Norma verdict.

## Repairs with observable benefits

- Avatar, thumbnail and gallery images enforce their embedded-image contract, rejecting external/active schemes while preserving raster images and supported SVG data forms.
- The production preview adds CSP and a no-referrer policy. Real Chrome checks that the application mounts and that the browser blocks external images and injected inline scripts. Development Fast Refresh and the renderer harness have distinct policy needs; this test does not claim those surfaces have identical CSP protection.
- Annotation capture validates stored PNG dimensions/data and rejects failed persistence instead of claiming success.
- Embed data failures display an actionable error and disable copying; clipboard success waits for the actual write. An actual React interaction test verifies the failure and recovery flow.
- Spreadsheet worker responses validate row shape, unsafe keys, finite numbers and resource limits. Dedicated-worker origin warnings were misapplied; payload validation still adds useful defense.
- Vite and metadata caches recover after failure. Independent demo imports are bounded to eight; an unsuccessful batch settles before retry, preserving order without overlapping unfinished work.
- Diagnostic commands close resources on failure and expose rejected operations at their owning CLI boundary.

Each new production repair includes the requested Norma/GPT-6/Codex attribution. None rewrites historical evidence or weakens release gates.

## Source-review dispositions

| Scope | Result | What it does not mean |
| --- | --- | --- |
| 241 security occurrences | 236 contextual false-positive assessments; five repaired paths: three image sinks, CSP and referrer policy | Not 236 provider dismissals or a new security score |
| 420 async-forEach occurrences | 417 synchronous callback signatures; three unresolved historical-copy cases pending | Not 417 bugs fixed; void callbacks can still launch separate unreturned work |
| 51 CLI occurrences | 14 associated with hardened paths, 30 contextual matches retained, seven sequential-work tradeoffs retained | Not 14 distinct production bugs or all 981 CLI findings resolved |
| Additional runtime checks | Embed error/copy behavior and worker-response hardening | Some worker findings overlap the security row; do not add counts blindly |

The security review used TypeScript receiver/signature checks for array mutations, manually traced four JavaScript array initializers, checked literal snippet matches, and retained hashes and original export indexes. The JSX assessments apply to the reported source/sink allegation; absence of a URL API in one file is not whole-program taint analysis.

The export reuses provider IDs. All 3,004 occurrences remain in the private baseline ledger; review receipts link to individual occurrences rather than dropping duplicates. Current file hashes identify reviewed content, not the unknown original scan commit.

## One fix, one deliberate non-fix

**Fix:** a failed render-server startup used to stay cached as a rejected promise, causing later attempts to repeat the failure. The repaired cache clears that failed state; tests verify that a subsequent attempt succeeds and concurrent callers share one attempt.

**Non-fix:** array `.push()` calls identified as open redirects remain unchanged. TypeScript resolves 177 to the standard Array.push declaration; four JavaScript cases explicitly initialize array buckets. None of those calls navigates a browser. Rewriting them would change the warning shape without improving security. This decision reflects evidence, not time pressure or acceptance of exposed secrets.

## Verification record

The initial full suite found nine failures, which were investigated rather than hidden. Seven were stale fixtures for existing output containment: macOS canonical paths and an explicit allowed output root. One caught a supported SVG `;utf8` form rejected by the new validator; compatibility was restored with regression coverage. One QA-render subprocess timed out during concurrent verification and passed on an isolated rerun. No golden baseline was updated.

**Final full-suite result: 274 test files passed; 6,415 tests passed; 23 skipped; zero failures.** TypeScript, the nine UI-kit package-boundary tests, generated-catalog consistency and the browser CSP check also passed. The final production and SDK builds passed. None establishes Norma-confirmed closure; a comparable full rescan is still required.


Published implementation: [visx-anlak ea935d03](https://github.com/miguelsuredasuau/visx-anlak/commit/ea935d03). The private repository retains the [batch summary](https://github.com/miguelsuredasuau/visx-anlak/blob/ea935d03/docs/analysis/norma-batch-summary-2026-09-20.md), occurrence ledgers, reproduction scripts and per-finding dispositions. Access to Xarts is required; no private source or raw export has been copied into this public report.
