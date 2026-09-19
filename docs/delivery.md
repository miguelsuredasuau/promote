# Delivery plan

For the next implementation milestone, use the [verified repair-loop delivery plan](repair-loop-delivery-plan.md): ownership, cross-repository contracts, sequencing, failure tests and observed completion criteria for P02–P06/P08.

The independently installed/tested contract core is complete: 70 tests and typecheck pass. Existing Xarts planning remains a local historical integration plan, not the new repository's source of truth.

| Stage | Depends on | Output and acceptance |
| --- | --- | --- |
| Contracts (verified) | None | Schemas, legal state transitions, frozen identity acceptance, fail-closed gates, marked fixtures; typecheck and contract tests pass |
| Controller (storage implemented) | Contracts | Durable operations, deduplicated intake, bounded retries, events; restart cannot duplicate dispatch |
| Devin adapter | Contracts | API start/inspect/feedback/cancel and reconciliation; unknown creation cannot trigger duplicate paid work |
| Runner | Contracts | Disposable execution with protected inputs/oracle; timeout and missing evidence block acceptance |
| External Xarts adapter | Contracts, runner | Independently verified reproducible chart incident and trusted packaging plan; no core import of Xarts |
| Visual operator | Contracts | Generic incident scene/table/evidence; configurable branding; fixture/live/replay labels |
| Repair loop | Controller, Devin, runner, Xarts adapter | Real first-attempt rejection, autonomous feedback/correction, final usable artifact |
| Release and audit | Repair loop | Exact accepted package regenerates original request; atomic activation and rollback; cancellation and stale evidence cannot publish |
| Public sharing | Audit, license selection | Reviewed public-source allowlist; reproducible clean install; README distinguishes implemented from planned |

Keep the hackathon scope to one project adapter, one real Devin repair loop, and one operator view. Synthetic project-neutral fixtures establish core independence; a second full production adapter is not required for this deadline.
