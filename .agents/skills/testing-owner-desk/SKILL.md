---
name: promote-merge-desk-smoke
description: Browser and local API smoke testing of Promote's owner merge desk without real GitHub credentials.
---

# Promote merge desk smoke testing

## Setup and safety
- Use Node 22 and the repo's existing pnpm dependencies.
- Create an empty temporary SQLite database and start `createOperatorServer` directly, as tests/operator.test.ts does. Do not run server/main.ts against a copied live database: it can observe or cancel real sessions and dispatch configured work.
- Use an isolated temporary root with synthetic `.env` and records. Never edit the operator's real `.env`, copy real credentials, or reuse its port. Listen on port 0 and read the allocated address.
- No real GitHub token is required for the unconfigured and fake-token rejection checks. Never substitute a real credential or perform a real merge as part of these negative checks.

## Devin Secrets Needed
- None for local negative-path smoke testing.
- A separately authorized `PROMOTE_GITHUB_TOKEN` is needed only for genuine GitHub list/merge tests.

## UI path and lifecycle checks
- Open **Your CEO's briefing**, then **Pull requests** in the decision rail.
- Check actual screenshot visibility, not only DOM presence: this is a Three.js/CSS surface.
- Verify the configuration hint, then in the isolated root configure `PROMOTE_GITHUB_TOKEN=fake` and a valid `PROMOTE_MERGE_REPOS=owner/repo` in `.env`. These values are read per request; no backend restart is normally required.
- Switch For you → Pull requests without reloading to check that a failed fetch replaces any cached configuration hint. Verify Refresh, close/reopen, and five-second overview polling.
- Test Demo exclusion and return to Live mode.
- Software WebGL can make transitions slow and trigger temporary snapshot timeout indicators. Wait for the visible surface to settle; Escape can return from a workstation. Do not mistake semantic offscreen workspace text for visible UI.

## Local API guards
- Obtain the local capability from `/api/owner-session`; use exact `X-Owner-Token`, same-origin `Origin`, and `Content-Type: application/json` for authorized POST checks.
- A configured fake token is necessary to reach body validation; unconfigured requests return 409 before validating the body.
- Use a definitely invalid repository pattern such as `not an owner/repo`. A path-like value such as `../invalid` matches the current regex and reaches the allowlist refusal instead.
- Verify missing-token 403, unconfigured 409, malformed input 400, wrong content type 415, oversized body 413, and sanitized GitHub 503.
- Keep owner capability values out of evidence files. Check rendered DOM and tested response bodies for the literal fake token.
- Remove test configuration and verify `/api/pull-requests` recovers to `configured:false`.
