"""Create the ACCURACY datasets that failed to generate in the dashboard.

Each of the eight QUALITY specifications gets one generated dataset, built from
the repository's knowledge base. Generation is asynchronous, so this polls until
each dataset reaches SUCCESS (or reports what it reached instead).
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import run_galtea_eval as runner  # noqa: E402  (reuses load_env / PRODUCT_ID)

KNOWLEDGE_BASE = Path(__file__).resolve().parent / 'knowledge-base.md'
MAX_TEST_CASES = 3

SPECS = {
    'specification_di5tyoarqo9vccv4htnj68y7': 'Stable Evidence Deduplication Accuracy',
    'specification_euv4h3nsk3hosmxcqbqv382d': 'No Invented User Evidence',
    'specification_g3ppe98w5c3ohji1pi8u8yp2': 'Provider Spend Reconciliation',
    'specification_k442na6z0t07bf8lm5d5moo1': 'Proposal Source Citation',
    'specification_mzu87jaqr44c3beh58c7sb4a': 'No Rate Free ACU Conversion',
    'specification_rq10bfaqd5keg69v2qw5vbon': 'No Reconstructed Hashes',
    'specification_rx5s8cmcujdq3ukpunpxbb3i': 'Exact Identity Quoting',
    'specification_zs87n1zo052hjzh959xk2axj': 'Chart Request Distinction',
}


def main() -> int:
    runner.load_env()
    import os

    import galtea as galtea_sdk

    client = galtea_sdk.Galtea(api_key=os.environ['GALTEA_API_KEY'])

    existing = {d.specification_id for d in client.datasets.list(product_id=runner.PRODUCT_ID, limit=500)}
    created = []
    for spec_id, name in SPECS.items():
        if spec_id in existing:
            print(f'skip (already has a dataset): {name}')
            continue
        try:
            dataset = client.datasets.create(
                product_id=runner.PRODUCT_ID,
                name=name,
                specification_id=spec_id,
                ground_truth_file_path=str(KNOWLEDGE_BASE),
                max_test_cases=MAX_TEST_CASES,
            )
            created.append(dataset.id)
            print(f'created {dataset.id}  {name}')
        except Exception as error:  # noqa: BLE001 - surface the server message verbatim
            print(f'FAILED  {name}: {error}')

    if not created:
        return 1

    print('\nWaiting for generation ...')
    deadline = time.time() + 1800
    while time.time() < deadline:
        rows = [d for d in client.datasets.list(product_id=runner.PRODUCT_ID, limit=500) if d.id in created]
        pending = [d for d in rows if d.status not in {'SUCCESS', 'FAILED', 'CANCELLED'}]
        if not pending:
            for d in rows:
                print(f'  {d.status:<10} {d.id}  {d.name}')
            return 0 if all(d.status == 'SUCCESS' for d in rows) else 1
        print(f'  {len(pending)} still generating ...', flush=True)
        time.sleep(20)
    print('! timed out waiting for generation')
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
