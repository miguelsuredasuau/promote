# Promoted

**Turn your Devin agent into the CEO of your codebase.**

Learns from user feedback, finds issues and opportunities, and ships verified improvements. Your code keeps healing and evolving—so you can focus on what matters.

A standalone foundation for an engineering control layer: receive an external request, dispatch an engineering agent, verify its candidate independently, return failures, and release only accepted artifacts.

**Status:** early implementation. Contracts, durable controller storage, a read-only owner briefing, and an audited Xarts gate catalog are implemented. Typecheck and 95 tests pass on Node 22.22.1. Autonomous scheduling, Devin execution, feedback ingestion, financial reconciliation, decisions and releases remain unconnected. Fixtures are not real autonomous runs.

## Development

Use Node 22.22.1 and pnpm 10.33.0:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm dev
```

Open `http://127.0.0.1:4310`. To inspect an external checkout, use `PROMOTE_PROJECT_PATH=/path/to/xarts pnpm dev`. The checkout stays separate and is read only. See the [owner console](docs/operator-console.md) and [CEO mandate](docs/ceo-mandate.md).

This repository has its own dependency manifest, lockfile, tests, and Git history. It does not require Xarts, its node_modules, fonts, source code, or credentials. Dependencies come from the package registry.

## Boundaries

- **Core:** incidents, state transitions, operation identity, policy, budgets, evidence, acceptance, and releases.
- **Harness adapters:** agent execution (Devin first; other providers can implement the same contract).
- **Project adapters:** request validation, trusted reproduction/evaluation/package plans, independent domain oracles.
- **Runner:** disposable candidate execution, with immutable evaluator/input identity and controlled evidence collection.
- **Operator UI:** provider-neutral live/replay view; configurable branding and artifact previews.

Xarts is the first external project integration; its catalog is audited and its execution adapter is still in progress. It remains a separate repository. See [repository boundaries](docs/repository-boundaries.md) and [delivery plan](docs/delivery.md), and [implementation stages and acceptance criteria](docs/implementation-plan.md).

## Sharing

The public repository contains the reusable foundation. Package publication remains disabled. An open-source license has not yet been selected; public visibility alone does not grant an open-source license. No Xarts source, brand assets, account identifiers, real run evidence, or credentials are included.

See [controller storage](docs/controller-storage.md) for the implemented interface and its boundaries. `pnpm check` includes a tracked-source credential-pattern and excluded-file check; it complements source review rather than guaranteeing secret detection.
