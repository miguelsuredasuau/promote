# Norma follow-up · September 20, 2026

Historical checkpoint. A subsequent [same-scope review, remediation and recheck](norma-remediation-2026-09-20.md) supersedes the outstanding recheck status below.

Promote has gained tested resilience improvements and an integrated advisory review since the [first pilot](norma-pilot-2026-09-19.md). No same-scope Norma recheck has yet established closure of the original 26 findings.

## Latest recorded controller review

The retained report reviewed changes from `f43b06fd45d2d311b681b8a837b147b5dbec8f11` to `2724df6ef67a79263b3c263faf5f85af016271a7`, finishing at **06:12:14 UTC on September 20**. Its [public structured projection](norma-follow-up-2026-09-20.json) contains file hashes, rule snapshots, finding locations and the original report’s SHA-256; local checkout paths are omitted.

| File | Findings | Recorded status |
| --- | ---: | --- |
| `server/engineering.ts` | 4 | Pending · incomplete coverage |
| `server/orchestrator.ts` | 14 | Pending · incomplete coverage |
| `tests/orchestrator.test.ts` | 0 | Pending · incomplete coverage |
| **Total** | **18** | **Pending** |

An earlier attempt at 06:06 UTC stopped with `authentication_required` and checked no files. Its zero count is not a clean result. The subsequent report contains actual findings but still has incomplete coverage for every file. It does not establish that credentials are valid now or that Devin’s separate MCP connection is configured.

These are different files from the first pilot. Comparing 26 with 18 cannot measure remediation. Neither report covers the latest main branch, and neither establishes a complete repository scan. Monetary usage was not reported.

## Implemented improvements after the reviewed candidate

The following changes are present in main at [`69e13f0`](https://github.com/miguelsuredasuau/promote/tree/69e13f0d535feb50abad1d2747f4b9a0e3314d68). They are verified implementation changes, not claims that particular Norma matches have disappeared.

| Change | Practical effect | Evidence |
| --- | --- | --- |
| Validate diagnostic snapshots before intake | Malformed result entries or release-shim lists are rejected before orchestration reads them. | [Intake tests](../../tests/chat-intake.test.ts), commit `bb1be2b` |
| Quarantine classification failures per record | A bad stored record is retained for inspection while other records continue through triage. | [Orchestrator tests](../../tests/orchestrator.test.ts), commit `bb1be2b` |
| Catch orchestration-cycle failure before scheduled review | A failed cycle still allows `reviewProject` to run and persist the next check; that review must itself succeed. | [Scheduler](../../server/main.ts), commit `bb1be2b`; no dedicated heartbeat regression test is claimed |
| Retain recovered library-defect signals | Recovery no longer hides a possible underlying library bug; corrected input mistakes remain filtered. | [Orchestrator tests](../../tests/orchestrator.test.ts), commit `2724df6` |
| Bind agent review to the candidate SHA | Missing, malformed or mismatched agent evidence remains pending; it cannot replace independent acceptance. | [Devin adapter](../../adapters/devin/client.ts), [adapter tests](../../tests/devin.test.ts) |
| Review frozen Git blobs independently | Candidate/file/rule identities are recorded, and incomplete checks remain pending. | [Norma tests](../../tests/norma.test.ts), [integration details](../integrations/norma.md) |

The local integration check at `69e13f0` passed the public-source scan, TypeScript check and **229 tests**, with **5 skipped**. These tests validate application behavior and integration handling; they are not a new live Norma scan.

## What still needs verification

- Recheck the original three files at a new frozen commit and triage matches individually before reporting resolved counts.
- Recheck engineering dispatch and orchestration after the later fixes; the retained follow-up predates them.
- Resolve or explain incomplete rule coverage with the provider. Current reports do not identify a reliably completed full ruleset.
- Review async warnings through their callers. Centralized handling can be intentional; sequential awaits may protect ordering and durable writes.
- Keep the original nested-condition findings open for contextual triage. No blanket cleanup or automatic parallelization was performed to silence those rules.

Norma remains advisory. Required build, behavioral and installed-consumer checks retain their own authority. This documentation refresh launched no provider review or paid Devin session.
