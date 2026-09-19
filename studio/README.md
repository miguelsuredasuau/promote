# Repository space pilot

A local onboarding studio that turns a curated repository brief into two real fal/Meshy assets. This pilot reads the configured local Xarts checkout, fingerprints README and theme tokens, and combines observed signals with the requested art direction. It does not claim arbitrary-repository autonomous art direction yet.

## Run

Requires Node 22 and the existing project dependencies. Put `FAL_KEY=...` in the ignored `.env` file (owner read/write only), or provide it through the environment. Never commit credentials or expose them to the browser.

```sh
node studio/pipeline.mjs /absolute/path/to/xarts
node studio/server.mjs
```

Open http://127.0.0.1:4311. The normal office remains on port 4310. The preview studio is an isolated entry experience; candidates do not automatically replace the office.

The first invocation submits at most two requests: a PBR chair and an animated humanoid engineer. There are no automatic paid retries. Request IDs persist before polling; rerunning resumes known requests. An ambiguous submission is stopped for review, not submitted again. Failed jobs are retained. A worker lock prevents concurrent runs; after an abnormal process exit, inspect the recorded request before removing a stale lock. Do not delete state to retry: doing so starts a fresh paid batch.

The pilot sends authored object prompts to fal. Room concepts additionally send the locally configured style, layout and logo reference images; regeneration also includes the previous concept. Repository source files and credentials are not sent to fal. Claude review receives the explicitly selected README and theme excerpts. The browser talks only to the local server; keys stay in the worker. Downloaded GLBs and the run record are under ignored `.local/asset-studio/`. Model files remain local pending visual and output-license review. Actual dollar spend stays unknown until a billing source reports it.

## Gates and limits

- GLB v2 container/length, JSON chunk, embedded resources, mesh budget and download budget.
- Character must contain skinning and animation before becoming a preview candidate.
- Maximum 150K triangles and 60 MB per output. These are rejection ceilings, not performance targets.
- Structural success is explicitly separate from visual approval. Browser import, faces, hands, deformation, materials and frame rate still need inspection.
- Source palette is distinguished from the user's creative overrides. No claim that the cobalt/orange palette was extracted from default chart tokens.
- Local server has an exact file allowlist, loopback binding and Host validation. Decision and room-generation endpoints require same-origin requests and a runtime token; opening the board never starts generation.

`node --test studio/pipeline.test.mjs` exercises rejection paths. Existing runtime/controller code is unaffected.

## Progress board

The root studio page displays eight production stages and a 17-item inventory, including CEO, engineering, quality and product/marketing roles. Inspecting a model opens a compact dialog with an interactive 3D viewer. The redundant Production Desk section is removed; model inspection stays in the item cards. The old preview page has been removed; `/preview` redirects to the board.

Shared equipment is marked **Default kit / planned** and remains visible alongside project-specific pieces. This classification is not a claim that reusable default models have already been extracted. Existing generated pilots can be selected for reuse, with feedback attached to each item.

`/progress` projects persisted outputs, the completed `claude -p` review and revisioned decisions. Stale revisions are refused. Feedback and reuse choices do not start paid generation.

Room concept generation supports Nano Banana Pro (2K), GPT Image 2.5 Flare (high), and FLUX.2 Pro through fal. Each revision records its model. Local style, layout and logo references are included; optional existing chair and engineer previews are hashed and recorded with the request. These references do not confer visual approval. The generation brief favors reuse and limits custom pieces to branding, staff and two or three statement furniture items. The board displays the resulting image and a mandatory-component checklist. Approval binds to the exact image hash; regeneration requires feedback and produces an unapproved revision. There are no automatic paid retries. Configure the reference PNGs under `.local/asset-studio/references/` before generation.

Current boundary: room concept generation/review and the item inspection UI work. Individual item concept generation, approval-driven 3D production and final room assembly are not connected yet. Those stages stay locked. Structural validity never implies visual approval; generated room concepts can miss required components or render incorrect lettering.

Run `node --test studio/concept.test.mjs studio/pipeline.test.mjs` for generation validation and approval rejection checks.

## Local persistence and history

The Studio now uses `.local/asset-studio/studio.sqlite` as the authoritative metadata store (Node built-in SQLite; Node 22.22+). Existing JSON records are imported on first access and retained as recovery copies. Room revisions, prompts, feedback, provider IDs, approvals and item decisions have transactional snapshots in `document_history`. Earlier item events that omitted feedback text cannot reconstruct that missing text.

PNG/GLB/reference files stay on disk under the same ignored directory. `asset_files` indexes their paths, sizes and SHA-256 hashes; binaries are not duplicated into SQLite. This catalog covers Studio assets, not every asset elsewhere in the main office repository. Back up the complete directory, including SQLite WAL files while running, or stop the server before copying it. Nothing is uploaded to GitHub.

The collection shows every room revision and allows selecting a ready revision as the next room reference. Selection does not approve it or generate anything; the chosen base is recorded when generation starts. Item dialogs retain change history. The checklist shortcut selects all components; a separate explicit approval still binds to the current image. Server startup resumes polling an existing request rather than creating a new paid job.
