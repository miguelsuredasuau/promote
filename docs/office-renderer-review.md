# Office renderer review

The original SVG department map matched the initial static office brief. The expanded brief requires articulated characters, depth-correct moving candidates, interactive equipment and textured displays. Prototype these in Three.js before extending the room artwork.

## Decision under evaluation

Use an orthographic Three.js scene for geometry, lighting, animation and raycast picking; keep accessible navigation, speech bubbles, drawer contents, reporting and keyboard interaction in HTML. Render screen content via CanvasTexture from the same normalized view model as the corresponding desk. Renderer objects never become evidence or release authority.

SVG can animate articulated groups and reorder layers, so it is not technically incapable of these interactions. The question is whether maintaining those features by hand is worthwhile. The separate QA prototype establishes the benefit of actual spatial geometry before a full conversion.

Three.js is pinned in pnpm and its exact browser modules are served locally through an allowlist. No CDN/import-map exception or bundler is required for this bounded prototype. It uses procedural geometry and no downloaded model packs. Any later third-party model/animation must have per-asset source, version, license and attribution recorded before inclusion; do not assume all packs from an author share one license.

## Prototype acceptance

At `/qa-prototype`, a clearly labeled synthetic candidate traverses grouped acceptance stages, stops on failure and resumes only as a corrected demo candidate. A jointed QA figure points at the line. Raycast picking and equivalent HTML stage buttons inspect the same state. Verify depth, resizing, readable texture, mobile use, reduced motion, paused/hidden rendering and unavailable-WebGL fallback. Measure browser errors and screenshots before deciding how to convert the rest of the office.

Grouping A00–A10 on a conveyor is presentation only. Every actual gate result still needs its individual identity and evidence. Demo motion never writes controller events, creates PRs or authorizes release.

## Preserved reporting

The backlog whiteboard holds fixes/features; the workstation holds recorded engineering events; the ideas wall holds proposals/owner decisions; QA holds the complete gate inspector; the finance safe holds costs and budget distinctions; the CEO briefing holds implementation milestones and integration evidence. Broker-style telemetry distinguishes observed counters from unknown data. The previous long-page evidence sections are relocated rather than removed.

The prototype established the benefit of spatial geometry. The main room now uses procedural Three.js geometry, articulated figures, projected hover labels and shared-model CanvasTexture displays. Selecting a station approaches it with the camera and reveals accessible HTML controls attached to each actual mesh face using the same orthographic camera projection. The old trial remains available for comparison.

## Source of truth and branding

Promoted's `contracts/` is canonical. The completed W01 worktree is archived locally, excluded from this public repository. Xarts' original planning pack is labeled historical and points here.

Public source includes intentionally requested integration names, original office artwork, palette values and audited command/path metadata, not Xarts chart implementation or proprietary font/logo files. The optional Xarts wordmark is served only from the explicitly configured external checkout; it is never copied into this repository or exported with a replay.
