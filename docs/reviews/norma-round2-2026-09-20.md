# Norma remediation · second pass

The same six files were reviewed again at `c2c8af6`. **39 → 35 recorded findings**; all four remaining nested-conditional matches disappeared. Combined with the [first pass](norma-remediation-2026-09-20.md), the observed progression is **47 → 39 → 35**. Provider coverage remains reduced throughout, so the review remains pending.

| File | Previous | Second pass |
| --- | ---: | ---: |
| Chat evidence intake | 15 | 14 |
| Devin adapter | 6 | 4 |
| Release registry | 0 | 0 |
| Engineering dispatch | 4 | 4 |
| Orchestrator | 14 | 13 |
| Orchestrator tests | 0 | 0 |
| **Total** | **39** | **35** |

[Structured evidence](norma-round2-2026-09-20.json) contains full commit, timestamps, file hashes, rule IDs, locations and a hash of the retained raw report. The provider's execution engine was not pinned; these are observed counts under reported incomplete coverage.

## Improvements

Quality evidence now uses explicit branches for missing, invalid or mismatched candidate reports, incomplete coverage, empty file lists and contradictory clean-with-findings reports. Incomplete evidence always takes precedence and stays pending. No report is inferred when there is no candidate.

Intake status explicitly prioritizes source failure over quarantine attention. Signal categories use direct conditions, preserving library-defect, infrastructure and feedback classifications.

Ten additional test cases cover quality-evidence precedence and intake failure/recovery. At the reviewed commit, `pnpm check` passed the public-source scan, TypeScript and **252 tests**, with **5 skipped**. No rule exclusions, retries, release permissions or scheduling/concurrency semantics changed.

## Remaining work

The remaining matches are **23 async-error-handling**, **11 sequential-await** and **1 explicit-any** warnings. Their contextual triage remains documented in the first-pass report. Removing catches from caller boundaries or parallelizing durable operations solely to satisfy static counts would need a separate behavioral justification. Typed dispatch for historical inbox records is still a useful future task; it needs migration and quarantine compatibility tests.

All six responses still report one unavailable Semgrep rule. No full-repository scan or complete pass is claimed. Monetary cost was not reported. This was a direct authenticated Norma run; no paid Devin session was launched.
