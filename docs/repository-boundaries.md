# Repository boundaries

The workshop is independently installed and tested. It must not import Xarts source, reference sibling node_modules, use workspace/file dependencies on Xarts, or require its checkout for core tests. Xarts-specific acceptance semantics belong to an external project adapter; any future Xarts adapter tests run separately against an explicitly configured checkout.

## Three separate authorities

1. The target project supplies the requested input and a pinned base commit.
2. Engineering works in a disposable clone/worktree and returns a candidate commit.
3. The workshop evaluates that exact candidate using a protected, versioned evaluator and immutable original input. Candidate code cannot rewrite its acceptance policy.

Acceptance binds candidate SHA, input hash, evaluator revision, and acceptance contract hash. Changing any identity requires reevaluation. Proposed new gates are evaluated separately and cannot authorize their own current candidate.

## Xarts integration

The Xarts application and package scripts do not depend on the workshop. A future trusted adapter configures repository identity, command plans, request schema, protected oracle, and artifact handlers. Local checkout paths and credentials belong in ignored local configuration; they are never hardcoded in public source.

Read/reproduce against a pinned snapshot. Write proposed repairs only to isolated candidate checkouts. Demo releases go to the workshop artifact registry. Updating Xarts main, pushing branches, or publishing packages is a separate explicitly configured release policy; the demo does not enable these actions.

## Public source boundary

Allowlist newly authored generic contracts, fixtures, tests, and documentation. Do not copy Xarts history, chart code, fonts, brand assets, scratchpads, environment files, account metadata, or raw provider transcripts. Keep synthetic fixtures visibly labeled and use fictional repository identities. Public replay evidence needs a separate sanitization/export step.

Independent architecture does not mean universal domain validation: each project still needs an adapter and an oracle that defines correctness for its own outputs.
