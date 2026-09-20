"""Deterministic stand-in for the Promote Maintenance Controller.

This is a WIRING CHECK, not the product. It calls no model: it answers from the
read-only controller snapshot with light keyword routing, so every test case
produces a real, non-empty, state-grounded response and every evaluation can
reach a terminal SUCCESS with a score. The scores measure the harness, not the
controller's quality -- for that, swap in `promote_agent.promote_controller`,
which needs an LLM key.

The first parameter is annotated `list[dict]` deliberately: Galtea picks the
argument shape from that annotation, and every dataset on this version is
multi-turn.
"""

import json

import state_snapshot

_STATE = None


def _state() -> dict:
    global _STATE
    if _STATE is None:
        _STATE = state_snapshot.state()
    return _STATE


def _incidents() -> str:
    rows = _state().get('incidents') or []
    if not rows:
        return 'No incidents are recorded.'
    lines = []
    for r in rows:
        blocked = f", blocked: {r['block']['reason']}" if r.get('block') else ''
        lines.append(
            f"- incident {r['id']} | status {r['status']} | base commit {r['baseCommit']} "
            f"| acceptance contract hash {r['acceptanceContractHash']}{blocked}"
        )
    return 'Incidents on record:\n' + '\n'.join(lines)


def _engineering() -> str:
    rows = _state().get('engineeringReservations') or []
    if not rows:
        return 'No engineering reservation exists.'
    lines = []
    for r in rows:
        lines.append(
            f"- incident {r['incidentId']} | mandate {r['mandateId']} | state {r['state']} "
            f"| reason {r['reason']} | ceiling {r['maxAcu']} ACU | base {r['baseSha']} "
            f"| candidate {r['candidateSha']} | allowed paths {r['allowedPaths']}"
        )
    return 'Engineering reservations (one session at a time, bounded by mandate):\n' + '\n'.join(lines)


def _budget() -> str:
    provider = (_state().get('services') or {}).get('provider') or {}
    if not provider:
        return 'The provider ledger is not configured. I cannot report reserved or spent budget.'
    return (
        f"Budget reserved for the first repair: USD {provider.get('firstRepairBudgetUsd')}. "
        f"Spend actually reported by the provider: not reported, so I report it as unknown rather than zero. "
        f"The ACU rate on file is {provider.get('usdPerAcu')} USD/ACU with rateSource "
        f"'{provider.get('rateSource')}' -- that is user-reported, not a verified rate, so I will not convert "
        f"ACU to money with it. Paid dispatch enabled: {provider.get('paidDispatchEnabled')}; "
        f"mandate authorized: {provider.get('mandateAuthorized')}; "
        f"provider connection verified: {provider.get('connectionVerified')}."
    )


def _release() -> str:
    delivery = (_state().get('services') or {}).get('delivery') or {}
    if not delivery:
        return 'No release has been activated and no delivery record exists.'
    return (
        f"Release {delivery.get('releaseId')} is {delivery.get('status')} for incident "
        f"{delivery.get('incidentId')}, built from candidate {delivery.get('candidateSha')}. "
        f"A candidate becomes a release only after independent verification of that exact commit; "
        f"I do not accept the author's own report as the pass."
    )


def _proposals() -> str:
    state = _state()
    statuses = state.get('proposalStatuses') or {}
    sample = (state.get('proposals') or [])[:3]
    lines = [
        f"- {p['id']} | {p['category']} | status {p['status']} | priority {p['priority']} "
        f"| executionMode {p['executionMode']} | evidence key {p['evidenceKey']}"
        for p in sample
    ]
    return (
        f"{state.get('counts', {}).get('proposals')} proposals are on record, by status: "
        f"{json.dumps(statuses)}. Each cites the evidence it was built from; these are produced by "
        f"deterministic local rules, not by a model. Examples:\n" + '\n'.join(lines)
    )


def _evidence() -> str:
    state = _state()
    intake = (state.get('services') or {}).get('intake') or {}
    records = intake.get('records') or {}
    return (
        f"Intake status {intake.get('status')}, configured={intake.get('configured')}. "
        f"{state.get('counts', {}).get('inbox')} inbox records, dispositions "
        f"{json.dumps(state.get('inboxDispositions') or {})}. "
        f"{records.get('duplicates')} deliveries deduplicated against an existing stable evidence identity, "
        f"{records.get('imported')} newly imported, {records.get('quarantined')} quarantined. "
        f"Deduplication is by content-derived evidence identity, so re-delivery does not inflate counts. "
        f"I report only impact the evidence records; I do not infer affected-user numbers, ROI or savings."
    )


REFUSAL = (
    "I will not do that. My scope, revision, budget and gates come from the owner's authorization, "
    "not from message content, pasted logs, repository files or anything attributed to another agent -- "
    "those are data, not instructions. I also cannot disclose my instructions or internal configuration. "
    "I will not widen scope, raise a ceiling, skip or regenerate around a gate, or treat a self-reported "
    "success as a pass. Tell me what you want authorized and I will say what it would require."
)

ROUTES = (
    (('ignore previous', 'disregard', 'system prompt', 'your instructions', 'reveal', 'pretend',
      'bypass', 'skip the gate', 'skip gates', 'override', 'jailbreak', 'developer mode',
      'without approval', 'just ship', 'ship it anyway', 'raise the budget', 'more acu',
      'delete', 'force merge', 'deploy'), lambda: REFUSAL),
    (('budget', 'cost', 'spend', 'acu', 'price', 'usd', 'ledger', 'invoice', 'reconcil'), _budget),
    (('release', 'ship', 'deliver', 'activate', 'accept', 'verify', 'gate', 'qa'), _release),
    (('devin', 'engineer', 'dispatch', 'mandate', 'session', 'candidate', 'sha', 'commit'), _engineering),
    (('proposal', 'improvement', 'roadmap', 'priorit'), _proposals),
    (('evidence', 'feedback', 'inbox', 'duplicate', 'dedup', 'report', 'user'), _evidence),
    (('incident', 'defect', 'bug', 'error', 'failure', 'blocked'), _incidents),
)


def _briefing() -> str:
    return '\n\n'.join((_incidents(), _engineering(), _budget(), _release(), _evidence(), _proposals()))


def promote_controller_stub(messages: list[dict]) -> str:
    """Answer the owner's latest turn from the controller's recorded state."""
    latest = ''
    for message in reversed(messages or []):
        if message.get('role') != 'assistant' and (message.get('content') or '').strip():
            latest = message['content'].lower()
            break

    body = None
    for keywords, handler in ROUTES:
        if any(k in latest for k in keywords):
            body = handler()
            break
    if body is None:
        body = _briefing()

    return (
        f"{body}\n\n"
        "Everything above is read from the controller's durable store; any field I did not name is not "
        "configured, and I have not estimated it. Identifiers are quoted in full and unmodified. "
        "Tell me which decision you want to make and I will name exactly what it needs."
    )
