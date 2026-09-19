# Xarts executable gate catalog

`adapters/xarts/gate-catalog.json` records 12 existing commands audited by reading their source and script definitions at the recorded `sourceRevision`. Source paths are references, not copied implementation. The audit did not execute any Xarts command, install dependencies, build a package or inspect historical result logs. All entries remain `executionStatus: not_run` (display: **NOT_RUN**).

The JSON distinguishes command existence, oracle independence and execution evidence. `sourceRevision` identifies the inspected checkout HEAD; it does not certify a clean tree, hash the inspected files, bind a future candidate, or identify the protected evaluator. A runner must record those identities separately. `sourceFiles` names the inspected implementation, with `package.json` confirming script entry points. `productionHelpers: yes` means the check uses production code/helpers; it is not by itself evidence that every assertion is circular. Independence of each expected value still needs review.

| Catalog checks | Autonomy mapping | Audit finding |
| --- | --- | --- |
| Financial bridge, units, external audit | A03, A04, A05 | Useful regressions; mixed production helpers and literal assertions, not independent semantic authority. Unit-label expectations reuse production formatting. |
| Golden render | A04, A05 | Demo XML smoke and normalized baselines; missing baselines can skip and update mode rewrites evidence. |
| Gate presence | A06, A07 | Enumerated lint files and skip/only patterns; no proof validators reject wrong output. |
| Overflow declarations | A06, A07 | Static source/declaration consistency; no output-level overflow proof. |
| UI holes | A06, A07 | Thumbnail detector with ratchet and control; UI scope, false positives and negatives. |
| Schema | A07 | Generated schema consistency with production schema. |
| Metadata | A06, A07 | Coverage ratchet and declaration rules; production layout thresholds reused. |
| Demo specifications | A04, A07 | Generated demo consistency and rendering; not original-request reproduction. |
| Typecheck | A07 | Type compatibility; no runtime semantics. |
| Package consumer | A04, A05, A08 | Installs exact tarball in temporary consumer and runs financial/browser checks; full oracle independence unreviewed. |

Mappings are coverage hints, never claims that the whole A00–A10 gate has been implemented. No entry is currently classified as proven independent. A00 provenance, A01 baseline, A02 scope, A09 activation and A10 repeat benefit require additional controller policies. A03 and A04 still require independent incident-specific meaning and artifact evaluators. Named `selfTest` commands are audited availability only: they have not run and do not establish A06 strength of a new validator.

The package command uses the concrete, repository-relative `.promote-inputs/candidate.tgz` mount point. A trusted runner must stage the exact compiled package there and record its hash. It must not substitute an arbitrary existing package. The consumer installs dependencies and requires Chrome for `--financial`; this catalog neither provisions nor runs it. Use an isolated evaluation workspace with protected inputs. Missing package, runtime, fonts, browser or install access is infrastructure evidence, not a semantic rejection.

## Profile builder

`buildXartsGateProfile` accepts explicit `selectedCatalogIds`, `profileId`, `evaluatorRevision` and `protectedGates.semantic` / `protectedGates.artifact`, each with its own `gateId`, positive `gateVersion` and matching `evaluatorRevision`. Empty, unknown and duplicate selections are rejected, as are overlapping gate identities, missing protected gates and evaluator mismatches. The builder returns the existing `GateProfile` contract and does not implement a `LibraryAdapter` or execute subprocesses.

The requested `profileId` is a logical controller label. The returned frozen `profileId` is `xarts-profile:` plus the canonical SHA-256 of that label and the full validated catalog. Consequently edits to argv, prerequisites, limitations or any other catalog content change the frozen profile identity and its acceptance contract hash, even if gate IDs and gate versions are unchanged. The evaluator must retain that exact catalog alongside the frozen profile.

Every selected command becomes **required** with `notApplicableAllowed: false`, regardless of oracle independence: a selected failing typecheck must block acceptance. Protected meaning and artifact gates are also required. The catalog cannot create a profile by itself. The trusted controller must provision independent evaluators at the declared revision and authenticate their results; supplying a string identity to this builder is not an attestation of independence. Never accept profile selections or protected identities directly from a candidate, browser or provider response. This is a profile construction boundary, not a complete repair or release policy.

Run exact argv arrays with `shell: false` from the isolated Xarts evaluation root after checking prerequisites and pinning runtime/environment. Enforce a protected evaluator checkout, fixture hashes, allowed environment and named expected test coverage. In particular forbid `UPDATE_GOLDEN=1`, and map skipped/missing mandatory baselines to `not_run`, not an exit-zero pass. A process exit code alone is insufficient. Build authenticated `GateResult` records for the exact candidate SHA, evaluator revision and input hash; bind the frozen profile hash through `AcceptanceIdentity`. Missing or malformed evidence must hold acceptance. Displaying a catalog row as NOT_RUN creates no result record.

## Legacy `_al-dia` evidence

Inspection of `render-cli/al-dia.ts` shows a summary with timestamp, short HEAD, mode, counts and per-step `ok`, `falla` or `saltado`. Those fields cannot supply absent full candidate SHA, immutable input hash, evaluator revision, profile hash, runner identity, artifact hash, per-check duration or exact command evidence. A short historical HEAD must never be expanded into an assumed current candidate, and a timestamp is not an evaluator identity.

Legacy summaries may be displayed as historical observations only. `saltado` (skipped) maps to `not_run`; it never means `pass` or `not_applicable`. `ok` and `falla` describe legacy observations, not authenticated current `GateResult` values. Do not fabricate missing hashes, attach current identities retroactively, or use summary counts to fill absent results. A fresh protected execution is required for authoritative candidate evidence. Raw historical logs and account-specific paths are intentionally absent from this public catalog.
