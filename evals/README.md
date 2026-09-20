# Galtea evaluation harness

Evaluates the Galtea product **Promote Maintenance Controller**
(`product_w07vya7olkv2fnkyxersjpqm`, version `version_e0fded5uz6ch3rwe2h8jpxgi`).

## Setup

The Galtea SDK + CLI and the Anthropic SDK live in a local venv (`.local/` is
git-ignored, so it never enters the repo):

```bash
/opt/homebrew/opt/python@3.13/bin/python3.13 -m venv .local/galtea-venv
.local/galtea-venv/bin/pip install galtea galtea-cli anthropic
```

The API key lives in `.env.local` as `GALTEA_API_KEY=...`. `.gitignore` already
covers `.env.*`, so the file is ignored; the runner loads it automatically.

## Running

```bash
.local/galtea-venv/bin/python evals/run_galtea_eval.py --agent stub            # every specification
.local/galtea-venv/bin/python evals/run_galtea_eval.py --agent stub --spec <id>  # one specification
.local/galtea-venv/bin/python evals/run_galtea_eval.py --report-only           # re-read statuses
```

`galtea.evaluations.run` does not raise when the agent errors on a test case --
it marks the trace `FAILED` and the evaluation lands `SKIPPED` and unscored --
so the runner always sweeps statuses afterwards and exits non-zero if anything
did not reach `SUCCESS`.

## The agent

This repository has no conversational surface: `server/` is deterministic
orchestration over an owner dashboard, and `prompts/` are local role rules. The
product under test is the conversational controller those rules describe, so it
is reconstituted here from what the repository actually owns.

| Module | What it is |
|---|---|
| `state_snapshot.py` | Read-only (`mode=ro`) snapshot of `.local/controller.sqlite` plus the real role prompts. Never starts `server/main.ts`, which polls Devin and can dispatch configured work. |
| `stub_agent.py` | `--agent stub`. **Wiring check only.** Keyword-routed answers built from the snapshot; calls no model. Proves the pipeline end to end; its scores measure the harness, not the controller. |
| `promote_agent.py` | `--agent claude`. An experimental conversational reconstruction: Claude driven by the role prompts and the same snapshot; not the production deterministic controller. Needs `ANTHROPIC_API_KEY` in `.env.local`. |

Both agents annotate their first parameter `list[dict]` deliberately -- Galtea
picks the argument shape from that annotation by identity, and every dataset on
this version is multi-turn. Neither file may use `from __future__ import
annotations`: that stringifies the annotation and silently changes the shape.

## Datasets

Datasets and metrics resolve from the specifications linked to the version; this
harness does not create them, with one exception. Eight `QUALITY`/ACCURACY
specifications had failed to generate in the dashboard, because an Accuracy
dataset is generated from a knowledge base file and none was supplied.
`build_knowledge_base.py` assembles that file from the role prompts and the real
controller state, and `generate_missing_datasets.py` creates the eight datasets
from it.

Generated `knowledge-base.md` contains local controller records and is git-ignored. Review it before sending it to an external evaluation provider. Python caches and credentials are excluded from publication. These evaluation scripts are experimental and do not establish a passing production gate.
