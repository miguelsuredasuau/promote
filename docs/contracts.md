# Implemented contracts

`contracts/index.ts` is the server entry point; `contracts/browser.ts` exports schemas and display types without authoritative evaluation, transition guards, or Node crypto.

Acceptance requires every required gate and binds candidate SHA, original input hash, evaluator revision, and acceptance-profile hash. Empty profiles, missing evidence, mismatched versions/identities, and unexpected gates fail closed. Accepted identity persists through release; changing it requires reevaluation. `outputArtifactHash` is domain-neutral.

All terminal transitions require remote sessions and local processes confirmed stopped. Cancellation is sticky. The v1 table routes cancellation with live work in evaluating/accepted/releasing through blocked then cancel_pending. Direct cancel_pending transitions can be considered in a versioned contract update.

Acceptance verdicts are process-local and immutable. After restart, reevaluate persisted gate evidence to mint a fresh verdict; never trust a client-supplied or deserialized verdict. These functions do not themselves establish evidence provenance: the future protected runner/controller owns that boundary.

Fixtures use fictional repository identity and are explicitly labeled FIXTURE with countsAsRealRun false. They cover repair, rejection/correction, input refusal, gate growth, capability growth, ambiguous provider creation, pending cancellation, stale candidates, missing evidence, and unknown spend.

The event reducer skips duplicate sequence numbers but does not detect sequence gaps; the controller/UI must recover from a snapshot. Several event payloads remain open records. No provider calls, persistence, release activation, or user-feedback ingestion are implemented yet.
