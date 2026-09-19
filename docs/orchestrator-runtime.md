# Evidence-driven orchestration

The service now runs the local scheduler before each ten-minute project review. It imports immutable evidence, classifies untriaged records, groups repeated signals into proposals, assigns role work and persists each result. Classification is deterministic local rules; it is not presented as an LLM analyst. Versioned role instructions live in `prompts/*-v1.md`; their hashes are recorded on work items. The engineer prompt is included in Devin requests.

Priority: candidate verification first, then reliability work. Every fifth eligible assessment is reserved for discovery, with aging for older work. A discovery slot does not interrupt recovery. Only an exact task with a valid mandate and funding policy can create a Devin session. The existing F1 authorization does not authorize the other proposed repairs or features.

Proposal assessment records evidence counts, uncertainty and the next check. It does not mark a defect reproduced. Positive observations are retained without manufacturing tasks. Quality failures and packaging workarounds become proposals; explicit feature requests and preferences stay distinct. Untrusted feedback cannot grant authority.

Work claims persist across restarts. Interrupted work keeps its slot until reconciliation. No automatic re-send of a paid creation request occurs. Candidate review fetches the named branch, checks commit identity, ancestry and exact changed paths. Missing isolated runtime checks block acceptance. The first candidate currently fails scope because `tests/sdk/compiler.test.mjs` was not included in its approved paths; that finding does not imply the code is incorrect.

The shared `web/operations-model.js` translates evidence into the 3D ticker and the operations journal. It shows the objective, current blocker, role status, next action, repair stages, proposals and human-readable events. Local roles are labeled local; Devin is labeled a remote AI agent. Dollar amounts remain estimates from user-reported pricing and provider usage can lag.

Remaining: model-backed semantic research and feature discovery, automatic reproduction of arbitrary proposals, independent SDK runtime gates and packaging, protected release activation, and operator reconciliation/scope-decision controls. The current scheduler executes triage, assessment, scope review and already-authorized dispatch; it does not autonomously approve new scope or spend.
