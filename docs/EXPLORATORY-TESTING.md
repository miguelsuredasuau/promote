# Exploratory tests in Promote

Open **Office menu → Explore & test** (`/testing`). The target comes from `PROMOTE_TEST_PROJECT_PATH` (default: the sibling xarts-chat checkout), never an arbitrary browser-submitted URL. Commit the target first. The screen displays the exact commit and requires an explicit ACU ceiling and time limit for one paid session. No test is dispatched simply by opening the page.

The initial profile runs xarts-chat's `npm run sandbox`: real app routes and UI with isolated synthetic records, SQL and fixture charts. It does not test Claude or the real SDK renderer. Use Xarts's standalone consumer checks for that boundary. Devin may choose additional scenarios within the focus, including responsive layouts, keyboard use, reloads, history and negative inputs.

A durable SQLite reservation is committed before the API call. Repair sessions and test sessions share one capacity slot. Ambiguous creation is held, never automatically resubmitted. The provider receives a native `max_acu_limit`; a polling deadline requests termination and capacity is not released until exit is observed. A server outage can delay deadline enforcement; the provider ACU cap remains the spending boundary. Usage enters the office finances as reported ACU; unknown charges remain unknown.

The report schema requires the tested commit, coverage, reproduction steps, expected/observed behavior, evidence references and limitations. Reports for another commit are rejected. Valid reports remain unverified discovery evidence and their findings enter the proposal queue for independent reproduction. They cannot create accepted candidates, pass gates or release software. Prompts forbid source writes and paid third-party calls; those are instructions to the remote agent, not a claim that its sandbox has technically lost all write/network capabilities.

The polling service retrieves report metadata, not remote screenshot files. The report includes references and a link to the Devin session. Review those artifacts before acting on a finding. Future adapters can add authenticated artifact download and independent replay without changing this distinction.

## Lessons from the overnight PRs

- Identify repositories by configured origin, while keeping transport credentials private.
- Prepare packages from exact committed files; reject sensitive paths and symlinks even when declared in package publication settings.
- Treat shared rendering changes as catalogue changes too: run thumbnail, primitive and schema consistency checks.
- Run a fresh external consumer; linked local dependencies can hide or create packaging failures.
- Test validators with valid and invalid inputs. Embedded font payloads must not hide non-finite SVG coordinates.
- Version engineering and QA prompts. Engineer v2 requires baseline reproduction, a bounded file plan, counterexamples and full final diff review.
- Do not repair a scope violation by weakening its gate. Request a new scoped mandate.
- Merge controls refuse absent, skipped, neutral, failed or pending checks. Lockfile, schema and golden conflicts require reviewed resolution; no automatic selection of one side.

Engineering's existing bounded task/mandate and delivery gates remain separate from test commissioning. This feature does not enable unlimited automatic repairs or automatic merges.
