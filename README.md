# Promoted

**Turn your Devin agent into the CEO of your codebase.**

Learns from user feedback, finds issues and opportunities, and ships verified improvements. Your code keeps healing and evolving—so you can focus on what matters.

A standalone foundation for an engineering control layer: receive an external request, dispatch an engineering agent, verify its candidate independently, return failures, and release only accepted artifacts.

**Status:** active integration. Chat evidence intake, durable orchestration, proposal triage, scoped Devin dispatch, ACU reservations, a ten-minute heartbeat and the live office/operations journal are implemented. A real repair candidate has been returned and reviewed for scope; no repaired Xarts release has been activated. Independent candidate runtime checks, packaging and automatic release completion remain in progress. Local analyst roles use deterministic rules, not undisclosed model calls.

## What is in this repository?

| Component | Location |
| --- | --- |
| 3D office and live viewer | `web/`, port 4310 |
| Asset builder, concept generation and model review | `studio/`, `web/studio/`, port 4311 |
| Orchestrator, durable queue, logs and budget controls | `server/`, `contracts/` |
| Devin engineering adapter and role instructions | `adapters/devin/`, `prompts/` |
| Local verified-release registry writer | `server/registry.ts` |

The chart-building chat is a separate **xarts-chat** project. The chart implementation is the separate private **visx-anlak** repository. The Studio builder here builds office assets; it is not the chart chat.

Devin pushes a candidate branch in the target repository. Promote checks that exact commit, builds and verifies its package, then activates a registry release. The chat's reader can install the active verified package for subsequent requests. This design does **not** serve arbitrary branch-tip commits, and the real candidate-to-release loop is not yet complete.

## Development

Use Node 22.22.1 and pnpm 10.33.0:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm dev
```

Open `http://127.0.0.1:4310` for the full-screen Xarts Office. The integrated Three.js room has five interactive workstations, an in-room ticker and CEO briefing. Hover objects for labels; select one to approach its working surface. Office menu provides keyboard navigation and mode switching. Live records are read-only; Explore demo runs a shared, explicitly illustrative repair story. The earlier renderer trial remains at `/qa-prototype`. To inspect an external checkout, use `PROMOTE_PROJECT_PATH=/path/to/xarts pnpm dev`. The checkout stays separate. Candidate review may fetch a remote branch but does not edit the working tree. Engineering pushes only the branch authorized by its task. See the [owner console](docs/operator-console.md) and [CEO mandate](docs/ceo-mandate.md).

This repository has its own dependency manifest, lockfile, tests, and Git history. It does not require Xarts, its node_modules, fonts, source code, or credentials. Dependencies come from the package registry.

## Runtime configuration

Use ignored `.env` for `DEVIN_API_KEY`, `DEVIN_ORG_ID` and `FAL_KEY`. Configure the external checkout with `PROMOTE_PROJECT_PATH` and the chat outbox with `PROMOTE_CHAT_OUTBOX` or `.local/integration.json`. Never commit credentials, transcripts or local runtime state. Existing evidence, generated assets and approval records under `.local/` are not included in a clone.

- [Devin configuration and spending](docs/devin-operations.md)
- [Orchestration roles, scheduling and current limits](docs/orchestrator-runtime.md)
- [Studio builder and viewer](studio/README.md)
- [Integration progress](docs/integration-progress.md)

`/activity` is the human-readable operations journal; clicking the office ticker opens it. The provider is not automatically authorized by configuring a key. Dispatch requires an exact approved task, budget and any funding conditions.

## Boundaries

- **Core:** incidents, state transitions, operation identity, policy, budgets, evidence, acceptance, and releases.
- **Harness adapters:** agent execution (Devin first; other providers can implement the same contract).
- **Project adapters:** request validation, trusted reproduction/evaluation/package plans, independent domain oracles.
- **Runner:** disposable candidate execution, with immutable evaluator/input identity and controlled evidence collection.
- **Operator UI:** provider-neutral live/replay view; configurable branding and artifact previews.

Xarts is the first external project integration; its catalog is audited and its execution adapter is still in progress. It remains a separate repository. See [repository boundaries](docs/repository-boundaries.md) and [delivery plan](docs/delivery.md), and [implementation stages and acceptance criteria](docs/implementation-plan.md).

## Sharing

The public repository contains the reusable foundation. Package publication remains disabled. An open-source license has not yet been selected; public visibility alone does not grant an open-source license. The public integration intentionally includes the Xarts name, an Anlak-inspired palette, and an audited catalog of command names and source-path references. It does not include Xarts implementation source, proprietary font files, logos, customer data, provider transcripts or credentials. Office illustrations are newly authored for Promoted.

See [controller storage](docs/controller-storage.md) for the implemented interface and its boundaries. `pnpm check` includes a tracked-source credential-pattern and excluded-file check; it complements source review rather than guaranteeing secret detection.
