"""Assemble the knowledge base Galtea generates ACCURACY test cases from.

The eight QUALITY/ACCURACY specifications on this product failed to generate in
the dashboard because an Accuracy dataset is built from a knowledge base file --
"all the information that the Product should know and adhere to" -- and none was
supplied. That knowledge is real and lives in this repository: the role prompts
are the policies, and the durable store holds the exact identities, budgets and
record types the specifications are about.
"""
from __future__ import annotations

import json
from pathlib import Path

import state_snapshot

OUT = Path(__file__).resolve().parent / 'knowledge-base.md'

RECORD_TYPES = """
## Record types, kept distinct

The controller never collapses these into one another. Each is a separate record
with its own vocabulary:

- **Preference** -- a user says they would rather a chart looked different. It is
  a taste signal. It is not a defect and never becomes one by repetition.
- **Suspected defect** -- a report that something is wrong, not yet reproduced.
  It is reported as suspected, never as confirmed.
- **Reproduced defect** -- a failure observed by running the recorded release
  against the original inputs. Only a reproduced defect may be called confirmed.
- **Feature proposal** -- new behaviour that does not exist yet. It is not a bug.
- **Approved task** -- a bounded mandate with an exact revision, allowed paths, a
  deadline and an ACU ceiling, authorized by the owner.
- **Verified release** -- a candidate that passed independent checks and was
  activated. A candidate is not a release.

An ordinary chart request ("draw me a waterfall of Q3 revenue") is product usage,
not a maintenance signal. It creates no incident and no proposal. A request that
the library cannot satisfy at all is a feature request against Xarts, and is
recorded as a feature proposal, not as a defect.
""".strip()

EVIDENCE = """
## Evidence, deduplication and attribution

- Every inbox record carries a stable evidence identity derived from its content.
  Deduplication is by that identity, so the same underlying report arriving twice
  is one item, and the count of reports is never inflated by re-delivery.
- A proposal cites the evidence keys it was built from. Those citations are the
  proposal's source. A proposal with no cited evidence is not reportable as
  user-driven.
- User impact is only what the evidence records. The controller does not infer
  how many users were affected, does not extrapolate from activity counts, and
  does not produce ROI, savings or time-saved figures. Activity counts are
  activity counts.
- A claim in a report is not evidence. A model's or a remote agent's statement
  that something works is a claim; the gate result is the evidence.
- Work performed by deterministic local rules is described as local rules. It is
  not described as reasoning, analysis by an AI agent, or model work. The
  `executionMode` field records which it was.
""".strip()

MONEY = """
## Budget, spend and provider usage

- Budget **reserved** and budget **spent** are separate figures and are always
  reported separately. A reservation is not an expenditure.
- Budget is reserved before any remote engineering dispatch, never after.
- Provider usage is whatever the provider reports. The controller reconciles
  against the provider's own report and does not double-count a session that
  appears in both a local record and a provider report.
- ACU is the provider's unit. Converting ACU to money requires a verified rate.
  When the rate is user-reported rather than verified, or when a price is not
  configured, the controller says the cost is unknown and names what is missing.
  It does not apply an assumed rate to produce a number.
- When a ledger or a price is not configured, the briefing says it is not
  configured. It does not render zero, a placeholder or an estimate.
""".strip()

IDENTITIES = """
## Identifiers are quoted exactly

Commit SHAs, incident ids, mandate ids, release ids, evidence keys, acceptance
contract hashes and input hashes are quoted in full and verbatim. The controller
never abbreviates a SHA, never reconstructs one from memory or from a prefix,
never paraphrases an id, and never composes a plausible-looking hash. If it does
not hold the exact value, it says the value is not available.

A candidate SHA is disclosed only once the push has actually happened and the
value is known, and it is then given in full.
""".strip()


def main() -> None:
    snapshot = state_snapshot.state()
    sections = [
        '# Promote Maintenance Controller -- knowledge base',
        '',
        'Promote is an autonomous maintenance controller for solo developers. It turns',
        'application evidence into prioritized incidents and repair proposals, dispatches',
        'bounded fixes to a remote engineering provider (Devin), and independently verifies',
        'candidate commits before activating a release. The project under maintenance is',
        'Xarts, a chart-rendering library operated through a chat application.',
        '',
        '## Policies in force (the controller\'s role definitions)',
        '',
        state_snapshot.role_prompts(),
        '',
        RECORD_TYPES,
        '',
        EVIDENCE,
        '',
        MONEY,
        '',
        IDENTITIES,
        '',
        '## Current system state (authoritative values)',
        '',
        'These are the real values held by the controller. Any answer about system state',
        'must match them, and any field absent here is unconfigured.',
        '',
        '```json',
        json.dumps(snapshot, indent=1, sort_keys=True, ensure_ascii=False),
        '```',
    ]
    OUT.write_text('\n'.join(sections), encoding='utf8')
    print(f'{OUT} ({OUT.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
