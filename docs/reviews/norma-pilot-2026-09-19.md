# Norma review: first live pilot

**26 findings across three files, with reduced rule coverage.** This is a bounded static review, not a repository-wide scan, security certification or release acceptance result.

## Scope and provenance

- Repository: [miguelsuredasuau/promote](https://github.com/miguelsuredasuau/promote).
- Frozen source commit: [`464acab3ba54b17c0622203aed8c5051b98e90df`](https://github.com/miguelsuredasuau/promote/tree/464acab3ba54b17c0622203aed8c5051b98e90df).
- Review date: September 19, 2026. Exact preparation and recording timestamps, file hashes and individual findings are in the [machine-readable report](norma-pilot-2026-09-19.json).
- Transport: authenticated MCP connection to Norma. The public repository was linked successfully before reviewing its committed source.
- Tools: `link_repository`, `get_rulesets`, `get_rules_for_ruleset`, `get_open_issues`, and `live_check`.
- Retrieved catalogs: TypeScript 1.0 (12 rules) and JavaScript 1.0 (30 rules). Livecheck reports its own evaluated ruleset list, which includes JavaScript, Node.js, React, Supabase, TypeScript and Vite. Catalog size is not a count of successfully executed rules.

The first attempt hit the client's 60-second MCP timeout. Read-only checks were retried with a 120-second ceiling and responses retained per file. Timings below describe the retained responses, not total session time or every possible server execution.

## Provider results

| File at reviewed commit | Lines | High | Medium | Total | Reported outcome | Response time |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| `server/chat-intake.ts` | 102 | 10 | 8 | 18 | `issues` | 42.5 s |
| `adapters/devin/client.ts` | 85 | 3 | 5 | 8 | `issues` | 10.3 s |
| `server/registry.ts` | 55 | 0 | 0 | 0 | `clean`, reduced coverage | 9.8 s |
| **Total** | **242** | **13** | **13** | **26** | **Review required** | — |

No finding limit was reached in the retained responses. Severity labels above are Norma's classifications, not independently confirmed impact ratings.

| Rule | Count | Initial interpretation |
| --- | ---: | --- |
| `js-no-error-handling-async` | 13 | Check error propagation through callers before treating these as unhandled rejections. |
| `js-nested-ternary` | 9 | Readability candidates; several findings point into the same expression. |
| `js-scl-await-in-loop` | 4 | Assess performance against ordering and persistence requirements before adding concurrency. |

## Coverage limits

**All three responses report `coverage.reduced: true`.** Norma says one Semgrep rule could not be evaluated because it was invalid or had not been validated before its fault-isolation budget ran out. The response does not identify which rule failed or distinguish those two causes. Therefore, zero findings in `server/registry.ts` means zero findings under the checks that ran, not complete coverage.

`get_open_issues` returned **`no_completed_scan`**. There was no completed full repository scan or existing scan backlog to report. This pilot does not produce a repository-wide Production-Ready Score.

Norma returned no monetary usage information. Cost is **unknown**, not zero. No Devin repair session was launched for this review.

## What the findings mean for Promote

The source already illustrates why these findings need contextual review. The async warnings at `server/chat-intake.ts:23–25` flag calls to a local `stage()` wrapper. That wrapper catches errors from each importer and records a failed stage. Those three matches alone do not establish an unhandled rejection. Other warnings require tracing their callers and failure paths independently.

The five nested-ternary findings in the Devin adapter overlap a single status-mapping expression across lines 57–59. They are not five independent runtime failures. A clearer mapping could improve maintenance, provided its status semantics remain unchanged.

The loop warnings identify possible serialization costs. Intake also records durable evidence and receipts; replacing loops with unbounded parallel work solely to silence a rule would require separate correctness and load checks.

## Outcome and follow-up

This run changed no application code, registered no fixes, approved no candidate and activated no release. The findings are published here as diagnostic evidence; they have not yet been imported into Promote's durable proposal queue or made an automatic release gate.

Next steps are to investigate the reduced coverage, triage the 26 matches, verify any accepted changes with behavioral tests, and then repeat the same bounded check. A full scan is a separate operation in the Norma portal.
