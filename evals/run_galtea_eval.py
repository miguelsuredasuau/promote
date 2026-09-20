"""Run the Galtea evaluation for the Promote Maintenance Controller.

    python evals/run_galtea_eval.py                 # every specification
    python evals/run_galtea_eval.py --spec <id> ... # a subset
    python evals/run_galtea_eval.py --report-only   # re-read the last run's statuses

Galtea does not raise when the agent errors on a test case: it logs the error,
marks that trace FAILED, and the evaluation ends up SKIPPED and unscored. So the
run is always followed by a status sweep, and a non-zero exit means something
did not reach SUCCESS.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

PRODUCT_ID = 'product_w07vya7olkv2fnkyxersjpqm'
VERSION_ID = 'version_e0fded5uz6ch3rwe2h8jpxgi'
PLATFORM_URL = 'https://platform.galtea.ai'
TERMINAL = {'SUCCESS', 'FAILED', 'SKIPPED', 'CANCELLED', 'OUTDATED', 'PENDING_HUMAN'}


def load_env() -> None:
    for name in ('.env.local', '.env'):
        path = REPO_ROOT / name
        if not path.exists():
            continue
        for line in path.read_text(encoding='utf8').splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, _, value = line.partition('=')
            os.environ.setdefault(key.strip(), value.strip())


def poll(galtea, deadline_seconds: int = 3600) -> list:
    """Wait until no evaluation for this version is still PENDING."""
    started = time.time()
    while True:
        rows = galtea.evaluations.list(version_id=VERSION_ID, limit=500)
        pending = [r for r in rows if getattr(r, 'status', None) not in TERMINAL]
        if not pending:
            return rows
        if time.time() - started > deadline_seconds:
            print(f'! still pending after {deadline_seconds}s: {len(pending)} evaluations', file=sys.stderr)
            return rows
        print(f'  {len(pending)} pending ...', flush=True)
        time.sleep(15)


ORG_ID = 'organization_st1eztgrlx38c6969b2fdrwa'
CLI = REPO_ROOT / '.local/galtea-venv/bin/galtea'


def credits(_galtea=None) -> str:
    """Credit status is CLI-only; the Python SDK exposes no organizations service."""
    import json as _json
    import subprocess

    try:
        out = subprocess.run(
            [str(CLI), 'organizations', 'get-credit-status', ORG_ID, '-o', 'json'],
            capture_output=True, text=True, timeout=60, stdin=subprocess.DEVNULL,
            env={**os.environ, 'NO_COLOR': '1'},
        )
        data = _json.loads(out.stdout)
        return f"{data['remainingCredits']} / {data['monthlyCredits']}"
    except Exception as error:  # noqa: BLE001
        return f'unavailable ({error})'


def metric_names(galtea) -> dict:
    try:
        return {m.id: m.name for m in galtea.metrics.list(limit=500, include_legacy=False)}
    except Exception:
        return {}


def report(rows: list, names: dict) -> int:
    statuses = Counter(getattr(r, 'status', None) for r in rows)
    print('\n=== Evaluation statuses ===')
    for status, count in sorted(statuses.items(), key=lambda kv: -kv[1]):
        print(f'  {status}: {count}')

    by_metric = defaultdict(list)
    for row in rows:
        if row.status == 'SUCCESS' and row.score is not None:
            by_metric[names.get(row.metric_id, row.metric_id)].append(row.score)

    if by_metric:
        print('\n=== Scores by metric (mean, n) ===')
        for name, scores in sorted(by_metric.items(), key=lambda kv: sum(kv[1]) / len(kv[1])):
            print(f'  {sum(scores) / len(scores):.3f}  (n={len(scores):>3})  {name}')
        every = [s for scores in by_metric.values() for s in scores]
        print(f'\n  overall mean: {sum(every) / len(every):.3f} across {len(every)} scored evaluations')

    unscored = [r for r in rows if r.status != 'SUCCESS']
    if unscored:
        print(f'\n=== {len(unscored)} evaluation(s) did not reach SUCCESS ===')
        for row in unscored[:30]:
            label = names.get(row.metric_id, row.metric_id)
            print(f'  {row.status:<14} {row.id}  canRetry={row.can_retry}  {label}')
            if row.reason:
                print(f'      {row.reason[:180]}')
        if len(unscored) > 30:
            print(f'  ... and {len(unscored) - 30} more')
        print("\n  The SDK model does not carry the skip/failure text; read it with:")
        print("    galtea evaluations get <id> -o json  # the 'error' field")

    print(f'\nView on the platform: {PLATFORM_URL}')
    print(f'  product {PRODUCT_ID} -> version {VERSION_ID} -> Evaluations')
    return 1 if unscored else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--spec', action='append', dest='specs', help='specification id (repeatable)')
    parser.add_argument('--report-only', action='store_true', help='skip the run, just read statuses')
    parser.add_argument('--agent', choices=('stub', 'claude'), default='stub',
                        help="'stub' answers from the state snapshot with no model (wiring check); "
                             "'claude' is the real controller and needs ANTHROPIC_API_KEY")
    args = parser.parse_args()

    load_env()
    if not os.environ.get('GALTEA_API_KEY'):
        print('GALTEA_API_KEY is not set (expected in .env.local)', file=sys.stderr)
        return 2

    import galtea as galtea_sdk

    client = galtea_sdk.Galtea(api_key=os.environ['GALTEA_API_KEY'])

    if not args.report_only:
        if args.agent == 'claude':
            import promote_agent
            agent, label = promote_agent.promote_controller, f'{promote_agent.MODEL} (effort={promote_agent.EFFORT})'
        else:
            import stub_agent
            agent, label = stub_agent.promote_controller_stub, 'deterministic stub (no model)'

        print(f'Running agent: {label}')
        print(f'Credits before: {credits(client)}')
        result = client.evaluations.run(
            version_id=VERSION_ID,
            agent=agent,
            specification_ids=args.specs,
        )
        print(
            f"Submitted: {result.get('testCaseCount')} test cases across "
            f"{len(result.get('specifications') or [])} specifications"
        )

    print('\nPolling for terminal statuses ...')
    outcome = report(poll(client), metric_names(client))
    print(f'Credits remaining: {credits(client)}')
    return outcome


if __name__ == '__main__':
    raise SystemExit(main())
