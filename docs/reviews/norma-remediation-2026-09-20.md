# Norma: same-scope review and remediation

Two live Norma MCP runs on September 20 checked the same six files before and after a bounded code change. **Recorded findings fell from 47 to 39; eight nested-conditional matches disappeared. All twelve file responses still report reduced coverage**, so both reviews remain pending. This is a maintainability improvement, not eight confirmed runtime or security defects repaired.

[Structured evidence](norma-remediation-2026-09-20.json) records full commits, UTC timestamps, source-file hashes, rule IDs and locations, and hashes of the retained raw reports. No credentials or source snippets are published. The execution engine was not pinned, so this is an observed comparison, not proof that the provider's implementation was identical.

| File | Before · `aa0898e` | After · `ff6d673` |
| --- | ---: | ---: |
| Chat evidence intake | 18 | 15 |
| Devin adapter | 11 | 6 |
| Release registry | 0 | 0 |
| Engineering dispatch | 4 | 4 |
| Orchestrator | 14 | 14 |
| Orchestrator tests | 0 | 0 |
| **Total** | **47** | **39** |

## Changes implemented

- Replaced the Devin adapter's nested session-status expression with explicit branches. Eleven status/detail cases test precedence, including terminal states with stale details, waiting, running and unknown states.
- Replaced nested intake error classification with explicit checks. Public diagnostics retain bounded reason codes, and a non-string error message cannot break its string check.
- Extracted the existing scheduled-review boundary into a testable function. Two regression tests verify that orchestration failure still reaches review, the next scheduled time is respected, overlapping ticks are ignored, and a failed review releases the in-flight lock. Error messages do not leak private exception details.

`pnpm check` passed at `ff6d673`: public-source scan, TypeScript and **242 tests**, with **5 skipped**. The two new scheduler files were not part of the six-file Norma comparison; their validation is the behavioral test suite.

## Triage of the remaining 39 matches

| Rule | Count | Disposition |
| --- | ---: | --- |
| Async error handling | 23 | Reviewed caller boundaries: intake stages catch importer errors; engineering/exploration observers catch adapter failures; claimed orchestration work catches failures, and the scheduler catches cycle failures. Retained as advisory matches, not automatically closed or suppressed. Persistence failures inside recovery paths still propagate and require operational handling. |
| Await inside loops | 11 | Preserve sequential evidence writes, provider observations/cancellation and claimed work execution. Unbounded concurrency would change ordering and controller capacity assumptions; any optimization needs a separate measured design. |
| Nested conditionals | 4 | Remaining compact classifications and quality-report handling are deferred maintainability work. This patch targeted the deeply nested status/error expressions; no rule exclusions were added. |
| Explicit `any` | 1 | The orchestration classifier still accepts heterogeneous historical records. Typed schema dispatch is a separate improvement that must preserve old records and quarantine behavior. |

## Remaining limits

Norma reports one Semgrep rule unavailable in every response, without identifying the rule. Zero findings therefore does not establish complete coverage. The same-scope recheck is now done; a full-repository scan and resolution of the provider's coverage problem remain outstanding. Provider cost is unknown. These were direct authenticated Norma runs, not paid Devin engineering sessions, and no release authority changed.
