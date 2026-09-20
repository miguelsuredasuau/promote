"""Read-only snapshot of the Promote controller's real state.

Everything here opens the SQLite store in ``mode=ro`` and never starts the
operator server: ``server/main.ts`` polls Devin, schedules work and can dispatch
configured engineering sessions, none of which belongs in an evaluation run.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATABASE = REPO_ROOT / '.local/controller.sqlite'
ROLES = ('orchestrator', 'feedback', 'product', 'qa', 'engineer')
ROLE_VERSIONS = {'engineer': 4, 'qa': 2}


def role_prompts() -> str:
    parts = []
    for role in ROLES:
        path = REPO_ROOT / f'prompts/{role}-v{ROLE_VERSIONS.get(role, 1)}.md'
        parts.append(path.read_text(encoding='utf8').strip())
    return '\n\n'.join(parts)


def _rows(connection: sqlite3.Connection, sql: str) -> list[dict]:
    return [json.loads(record) for (record,) in connection.execute(sql)]


def _incident(record: dict) -> dict:
    return {
        'id': record['id'],
        'status': record['status'],
        'targetLibrary': record.get('targetLibrary'),
        'requestedOutcome': record.get('requestedOutcome'),
        'baseCommit': record.get('baseCommit'),
        'evaluatorRevision': record.get('evaluatorRevision'),
        'acceptanceContractHash': record.get('acceptanceContractHash'),
        'acceptedIdentity': record.get('acceptedIdentity'),
        'block': record.get('block'),
        'cancellation': record.get('cancellation'),
        'trigger': record.get('trigger'),
        'createdAt': record.get('createdAt'),
        'updatedAt': record.get('updatedAt'),
    }


def _reservation(record: dict) -> dict:
    task = record.get('task') or {}
    return {
        'incidentId': record.get('incidentId'),
        'mandateId': record.get('mandateId'),
        'state': record.get('state'),
        'reason': record.get('reason'),
        'maxAcu': record.get('maxAcu'),
        'remoteId': record.get('remoteId'),
        'candidateSha': record.get('candidateSha'),
        'baseSha': task.get('baseSha'),
        'allowedPaths': task.get('allowedPaths'),
        'contractSummary': (task.get('contractSummary') or '')[:600],
    }


def state() -> dict:
    """Read the controller's durable state. Returns empty sections if absent."""
    if not DATABASE.exists():
        return {'databasePresent': False}
    connection = sqlite3.connect(f'file:{DATABASE}?mode=ro', uri=True)
    try:
        services = {
            identifier: json.loads(record)
            for identifier, record in connection.execute('select id, record from service_state')
        }
        proposals = _rows(connection, 'select record from proposals')
        return {
            'databasePresent': True,
            'services': services,
            'incidents': [_incident(r) for r in _rows(connection, 'select record from incidents')],
            'engineeringReservations': [
                _reservation(r) for r in _rows(connection, 'select record from engineering_reservations')
            ],
            'engineeringMandates': _rows(connection, 'select record from engineering_mandates'),
            'proposals': [
                {k: p.get(k) for k in ('id', 'title', 'category', 'status', 'priority', 'executionMode', 'nextAction', 'evidenceKey')}
                for p in proposals
            ],
            'counts': {
                name: connection.execute(f'select count(*) from "{name}"').fetchone()[0]
                for name in ('inbox', 'incidents', 'proposals', 'owner_decisions', 'work_queue', 'chat_progress', 'explorations')
            },
            'inboxDispositions': dict(
                connection.execute('select disposition, count(*) from inbox group by disposition')
            ),
            'proposalStatuses': dict(
                connection.execute(
                    "select json_extract(record, '$.status'), count(*) from proposals group by 1"
                )
            ),
        }
    finally:
        connection.close()


def briefing() -> str:
    """A compact, factual state briefing for the controller's system prompt."""
    snapshot = state()
    if not snapshot.get('databasePresent'):
        return 'CONTROLLER STATE: no durable store is present. Every state field is unconfigured; report it as unconfigured rather than rendering a value.'
    return 'CONTROLLER STATE (read-only snapshot of the durable store):\n' + json.dumps(snapshot, indent=1, sort_keys=True, ensure_ascii=False)


if __name__ == '__main__':
    print(briefing())
