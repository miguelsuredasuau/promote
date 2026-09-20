# Norma in the engineering and verification workflow

Norma is an **advisory review**, separate from mandatory build, consumer and behavioral gates. Findings do not automatically expand an engineering task or approve a release. Incomplete review is `pending`, never `clean`.

## 1. Connect Norma in Devin

The Claude Code connection on your computer is not shared with Devin.

1. In Devin, open **Customize → MCPs → Add MCP → Add custom MCP**.
2. Name it `norma`, select **HTTP**, and use `https://api.qualityclouds.ai/mcp`.
3. Select **OAuth**, save, and choose **Connect** to complete authorization. Choose the appropriate personal or organization scope.
4. Use **Test listing tools**. Confirm `link_repository`, `get_rulesets`, `get_rules_for_ruleset` and `live_check` appear.
5. Start a future authorized engineering task. Existing sessions are not silently restarted or given a new spending allowance.

These are Devin's [documented MCP setup steps](https://docs.devin.ai/work-with-devin/mcp). If the provider requires manual OAuth application setup, follow the callback URL shown in Devin. Never paste tokens into an engineering prompt.

Engineer prompt v4 (building on v3) tells Devin to load the applicable rules before editing, check changed source files, recheck fixes and return `normaReview` with commit, checked files, findings, coverage and limitations. The structured output requires that report. Missing authentication must be reported as pending; normal authorized repair work and required tests can continue. Reported diagnostics are recorded as **engineering-agent evidence**, not independent acceptance. A missing, invalid or mismatched report becomes pending when the candidate is observed.

## 2. Configure Promote's independent client

In ignored `.local/norma.json`:

```json
{
  "enabled": true,
  "repositories": ["your-owner/your-repository"],
  "credentialSource": "env"
}
```

Supply `NORMA_ACCESS_TOKEN` through the ignored `.env` or service environment. The repository allowlist controls which projects may be submitted to the remote service. Do not commit credentials. The server endpoint is fixed; candidate code cannot replace it.

For this Mac's existing Claude Code OAuth connection, `credentialSource: "claude-keychain"` reads only the Norma entry from the macOS keychain, without exporting or storing its token. Run `claude mcp login norma` to authenticate again when necessary. The client does not implement token refresh; an expired or unavailable token produces pending review. Linux deployments should supply a valid token via their secret-management process.

Configuration is read at each review. Code changes require restarting a non-watching Promote process. New clones have no local configuration and report the review as disabled.

## 3. Independent delivery review

The Xarts delivery pipeline invokes Norma after validating repository identity, candidate ancestry, permitted paths and original SQL evidence, before its package build. It reads changed regular Git blobs at the **exact candidate SHA**, never dirty working-tree files or symlink targets.

The persisted report includes:

- Base and candidate commits; per-file content hashes.
- Observed ruleset versions and rule-content hashes, checked again after review to detect drift.
- Findings by rule ID and source location; returned count and coverage limitations.
- Advisory status, timestamps and unknown provider cost.

Every report is saved atomically under `.local/norma-reviews/<sha256>.json`. The activity journal records its digest, file results, rule identities and next action under verification. Raw provider messages, code snippets and credentials are not included in those activity events.

Limits: ten changed JS/TS source files, 128 KiB per file, 100 returned findings per call, a three-minute network deadline, and no automatic retries. Deleted and non-JS/TS files are explicitly excluded from this source-only scope. Unsupported or refused source checks, reduced/absent coverage, capped results, unknown rule provenance, rule drift, malformed responses and unavailable authentication are pending. Findings already received remain visible even if completion fails.

The observed rule snapshots do not pin Norma's execution engine. A ruleset returned by Livecheck that was absent from the initial catalog cannot establish complete provenance and produces pending review. A `clean` result applies only to the checked changes and observed rules, not the whole repository.

Advisory findings or an unavailable review do not bypass or replace required release gates. They also do not block release in this initial mode. A future mandatory policy needs separately selected rules, false-positive triage and explicit handling of incomplete checks.

## Manual review

From the Promote checkout, with configuration and credentials in place:

```sh
pnpm norma:review /absolute/project/path owner/repository FULL_BASE_SHA FULL_CANDIDATE_SHA
```

This uses the same independent client and appends to the local activity journal. It does not create a Devin session or activate a release. Exit code 2 indicates pending or disabled review; exit code 0 indicates a completed advisory result, which may still contain findings. Inspect the printed status.

## Validation and rollout

Tests exercise frozen Git bytes, repository mismatch, symlinks, excluded credential paths, partial coverage, capped/malformed replies, rule drift, missing authentication, and separation from mandatory delivery gates. Mocked provider tests verify the Devin instructions and structured report.

The [initial live pilot](../reviews/norma-pilot-2026-09-19.md) is historical evidence from the manual client. It is not proof that Devin's separate MCP connection has been configured. No paid Devin session is launched to validate this integration automatically.

Local integration check (September 20, 2026): the manual command used the configured keychain credential source and persisted `pending / authentication_required` because the existing token had expired. This validates the unavailable-authentication path, not a successful live scan by the new client. The implementation passed TypeScript and 222 unit/integration tests; five optional Docker tests were skipped. Devin's separate OAuth connection remains an operator setup step.

The [September 20 follow-up](../reviews/norma-follow-up-2026-09-20.md) records a subsequent controller review and distinguishes later application fixes from findings that have not been rechecked.
