# Norma: reconciling the code review, export and dashboard

The prior zero-findings headline was too prominent for a bounded result. It must not be interpreted as zero outstanding issues in Promote. This audit compares the supplied export with retained Livecheck results and current source at `8478199`. No new provider scan was launched during this reconciliation.

## Three distinct evidence sets

| Evidence | Count | Actual scope and limits |
| --- | ---: | --- |
| Retained code Livecheck responses | 0 final findings | Ten named files; partial rule coverage; commit/file-hash bound. No full repository or prompt-analysis coverage. |
| Supplied September 20 JSON export | 121 unique issue IDs | 118 Prompts Analysis findings and 3 Agentic Rules Analyzer findings, referencing 15 paths. No scan ID or source commit SHA is included. |
| Dashboard text supplied by the user | 450 issues; score 55/100 | Reports 9 rulesets and 192 rules. Not independently retrieved in this audit. Displayed scan time is 07:52, with no timezone supplied. |

None of the 15 export paths overlaps the ten-file Livecheck scope. The tools differ too: the exported rules are prompt-analysis and agentic rules, not the three JavaScript/TypeScript rule families addressed in the prior remediation. Fixing the earlier 35 matches does not resolve these 121 findings or recalculate the dashboard score.

Every exported detection timestamp is `2026-09-20T07:45:50Z`. That cannot safely be equated to the dashboard's displayed time without its timezone and scan identity. Export links point to mutable `main`, not a frozen commit.

## Why 121 and 450 cannot be treated as the same dataset

| Area | Export | Supplied dashboard |
| --- | ---: | ---: |
| Architecture | 17 | 0 |
| Maintainability | 36 | 101 |
| Manageability | 31 | 39 |
| Performance | 18 | 30 |
| Scalability | 5 | 279 |
| Security | 14 | 1 |
| **Total** | **121** | **450** |

The export has **37 high, 51 medium and 33 low** findings. The dashboard's provided severity totals are **180 high, 253 medium and 17 low**. Because some export categories exceed the dashboard counts, calling the export an ordinary filtered subset of the same categorized issue set would be unjustified. Possible differences include scan, analyzer aggregation, status, filters or classification; the export does not establish which explanation is correct. Do not add 121 and 450 together either.

A complete reconciliation needs the dashboard's scan ID, frozen commit, timezone, included analyzers/status filters and the export corresponding to its 450 issues.

## Context checked in source

- **30 export findings concern older prompts:** engineer v1 (10), v2 (4), v3 (5), and QA v1 (11). `server/role-prompts.ts` selects engineer v4 and QA v2. Those old files still exist, so these are valid repository inventory entries; they do not by themselves describe the currently selected prompt. Do not mark them resolved without an explicit historical/current policy and a new scan.
- **JSON schema is supplied outside some prompt strings.** `studio/review.mjs` passes a schema through Claude's `--json-schema`; the Devin adapter sends `structured_output_schema` for engineering and exploration. Findings asserting that no output contract exists need to account for those call sites. A clearer prompt can still help, but duplicating schemas everywhere is not automatically the right fix.
- **Model inputs also live outside prompt strings.** `studio/models.mjs` sends an `image_url`, model options and a `texture_prompt` to an image-to-3D endpoint. Recommendations to add a text/JSON output format or supply a missing image may misunderstand that endpoint when based only on the extracted text.
- **Template placeholders are interpolated by JavaScript.** `${JSON.stringify(evidence)}` is not evidence that a model executes JavaScript. The real question is whether untrusted repository content can influence the model's output or subsequent actions. The current review uses restricted tools and MCP configuration, but adversarial input tests remain useful.
- **Exploratory evidence is partly specified already.** The prompt requests exact steps, screenshots, console/network errors and artifact paths/URLs; the structured schema has an evidence array per finding. A claim that evidence is entirely absent is too broad. Checking whether every finding has sufficient evidence is still useful.

These observations justify contextual triage, not blanket dismissal of prompt-analysis findings. The metadata inventory retains all 121 as unresolved; it is not a claim that each has completed a behavioral assessment.

## Highest-priority concrete follow-up

1. **Session-token boundaries.** Both reported endpoints do return their browser session token. These are not provider API keys. The local owner endpoint has Host/Origin/Fetch-Metadata checks, and mutations require token plus same-origin requests; Studio has Host validation and token/Origin checks on privileged POSTs. Returning a local anti-CSRF token to its intended UI is not itself proof of credential exfiltration. Studio's GET bootstrap warrants particular review because it lacks the owner endpoint's equivalent Fetch-Metadata restriction. Evaluate cross-origin readability, local attackers, XSS and any remote-deployment assumptions before choosing cookies or another session design. No exploit or fix is claimed by this audit.
2. **Server/UI dependency.** `server/improvements.ts` imports definitions from `web/decision-demo.js`. The architectural finding is confirmed in current source. Shared data should have a deliberate shared/server contract rather than depending on a browser module.
3. **Active prompt quality.** Prioritize injection boundaries and grounded evidence in Studio, required report fields and negative cases in active agents, then concise output contracts/examples for product and feedback tasks. Verify the full assembled request, including schema, task constraints and model parameters.
4. **Comparable full scan.** Re-run the relevant analyzers on a frozen commit after accepted changes. Keep raw counts, false-positive/context decisions and accepted exceptions separate; a zero in one check must never replace the aggregate scan status.

[Machine-readable inventory](norma-scope-reconciliation-2026-09-20.json) preserves issue IDs, paths, rule IDs, severity and source-export hash, without copying embedded prompts, code snippets or local private data. The raw supplied export remains local. The [previous bounded remediation](norma-zero-findings-2026-09-20.md) remains historical evidence, not an overall clean bill of health.

## First implementation follow-up

- Architectural finding `362abe47-96a9-4c63-ab27-74a53ad15068`: proposal definitions moved to `contracts/decision-definitions.mjs`. The server and generation script now import that shared data module; the browser module re-exports it for compatibility through an explicit allowlisted asset route.
- Studio finding `738814d0-af34-45a3-ac2c-3fd3e543e41c`: `/progress` no longer contains the session token. A dedicated `/session` bootstrap rejects cross-site/same-site browser requests and mismatched Origin headers. Privileged writes retain same-origin plus token checks, now using bounded constant-time comparison. Local clients without Fetch Metadata can still bootstrap; this remains a local trust model, not authentication for remote users.
- Owner-session finding `d00a7df0-9eee-4a2f-9331-891aea4a8a30` remains under contextual review. This change does not replace the owner's session mechanism with cookies or claim that token delivery to its intended UI was an exploit.

Tests cover Studio origin/token rejection and allowlisted shared-module delivery. These are implementation changes awaiting analyzer recheck, not provider-confirmed issue closures. No dashboard total has been decremented. The running Studio process must reload the updated server before its browser uses the new session route.
