# Visual directions in the office

Open **http://127.0.0.1:4310/?demo=decisions**, or choose **Explore demo** in the office and open the owner decision desk.

Four illustrative directions explore an installable adapter, bounded maintenance autonomy, feedback prioritization and safe delivery. Each combines a generated image with accessible HTML: the question, recommendation, alternative and boundaries. These are product concepts, not an implementation status report.

Choices are local to the mounted view. The demo never requests an owner token, posts an approval, dispatches engineering or changes the release registry. Reloading or leaving the view clears choices. The live owner workflow is unchanged.

## Images and brand

The four bundled PNGs were generated through fal using `openai/gpt-image-2.5/flare/edit`. `studio/brand-profile.mjs` supplies the same palette and materials to office generation and decision illustrations. Labels remain HTML so their meaning does not depend on generated typography. Images can be opened at full resolution.

The generation tool is explicit, not triggered by viewing a proposal:

```sh
node scripts/generate-decision-demo.mjs --submit
```

It requires `FAL_KEY` in the project environment and the local office style reference at `.local/asset-studio/references/style.png`. Initial generation can incur provider charges. Four requests were completed for the supplied set. No dollar total was reported by the image API; cost is unknown, not zero.

Each image has a local durable journal containing its input fingerprint, provider request ID and output hash. A batch lock prevents simultaneous runs. Subsequent runs reuse completed images or resume recorded requests. An ambiguous submission without a request ID is never automatically retried. A changed input requires explicit revision management; do not delete an uncertain journal to retry a paid submission.

This release is a curated demo. Generating images automatically for live proposals, per-client brand configuration, and image-cost ingestion are future integration work.
