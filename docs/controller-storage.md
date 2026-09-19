# Controller storage: first slice

`server/store.ts` implements `ControllerStore` using Node's built-in SQLite module. The pinned Node 22 runtime currently labels SQLite experimental. Database files and their journals are excluded from public source.

| Method | Behavior |
| --- | --- |
| `createIncident(input)` | Parse a fresh received incident; atomically save it and its received event; return the original on an identical idempotent retry |
| `getIncident(id)` | Read and validate the stored incident |
| `eventsAfter(sequence, limit = 100)` | Read globally ordered events; limit bounded to 1–1,000 |
| `enqueueOperation(input)` | Persist create-session intent and dispatch event before any claim |
| `claimOperation(id, workerId)` | Atomically grant one claim token; never reclaim an in-flight operation merely because time passed |
| `completeOperation(id, token, outcome)` | Record created, rejected or unknown outcome; ownership and identical retry checks required |
| `getOperation(id)` | Read validated operation state |
| `close()` | Close the database |

This is an internal trusted-controller interface, not a public HTTP API. A future request service must construct incident IDs, frozen hashes and policies from trusted inputs. A future scheduler must enforce lifecycle, cancellation, budgets and deadlines before dispatch. Storage does not authorize those actions itself.

The create-only dispatch ledger maps to the shared provider-operation concepts but does not implement feedback, cancellation, reconciliation or generic operation scheduling. An in-flight or unknown outcome is intentionally held indefinitely until a future reconciliation workflow can establish what happened. This prevents duplicate sends but is not yet automatic recovery.

Verification covers restart persistence, deduplication with changed controller timestamps, conflicting content with identical claimed request hashes, two database connections, exclusive claims, invalid ownership, persistent unknown outcomes, and rollback under deliberately failing SQL event inserts. A known created outcome and its session event commit together.
