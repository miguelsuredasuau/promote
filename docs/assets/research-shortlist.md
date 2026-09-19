# Office asset research

Researched 2026-09-19. This is a sourcing decision record, not a claim that these assets are installed or visually accepted. The existing room remains a working prototype; its procedural people are below the intended realism standard.

## Recommended candidates

| Component | Candidate and source | Modification / fit | Evidence and remaining work |
| --- | --- | --- | --- |
| Adult staff | [MakeHuman / MPFB core assets](https://static.makehumancommunity.org/about/license.html) | Build adult proportions, faces and individual outfits; export a skinned GLB. Core assets are CC0. | Best open redistribution route found, but requires character art, rigging and animation work. It is not a ready-made photoreal staff pack. |
| Staff wardrobe | [Shirts 01](https://static.makehumancommunity.org/assets/assetpacks/shirts01.html), plus CC0 Pants 01 and Shoes 01 in the [pack catalog](https://static.makehumancommunity.org/assets/assetpacks.html) | Candidate fisherman sweater, polo and tucked shirt; recolor to cobalt, coral and cream. | Catalog identifies individual assets/authors/licenses. Other packs include CC-BY content: preserve their specific attribution if selected. |
| Seated engineer | [Poses 01](https://static.makehumancommunity.org/assets/assetpacks/poses01.html) | Use a sitting pose as a starting point; adjust hands to keyboard and feet to floor. | CC0 pose collection. Poses are not typing animation clips; animation still needs authoring. |
| Lounge chair | [Modern Arm Chair 01](https://polyhaven.com/a/modern_arm_chair_01), Vibrant Nordic | Preserve modeled cushions and wood joints; change upholstery deliberately to match the office. | CC0, approximately 9K triangles on source page; Blender, glTF and FBX options. Black leather is a starting material, not the intended final palette. |
| Sofa / material benchmark | [Khronos Sheen Wood Leather Sofa](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/SheenWoodLeatherSofa) | Detailed fabric, wood and leather; useful benchmark for how close-up materials should render. | Adaptation is CC-BY 4.0, credit Darmstadt Graphics Group / Eric Chadwick; original by Fran Calvente is CC0. Downloaded locally and structurally inspected, not integrated. |
| Small realistic plant | [Potted Plant 02](https://polyhaven.com/a/potted_plant_02), Rico Cilliers | Keep botanical leaf geometry; replace weathered terracotta with a cleaner ceramic pot. | CC0, 0.8 m, source lists 70K triangles. Needs lower-detail version, texture reduction and leaf transparency review. |
| Tall perimeter plant | [Potted Plant 01](https://polyhaven.com/a/potted_plant_01), Rico Cilliers | Perimeter greenery with a new clean planter. | CC0, 1.4 m, source lists 96K triangles. Do not duplicate full-resolution versions throughout the room. |
| Floor | [ambientCG Terrazzo 019 L](https://ambientcg.com/view?id=Terrazzo019L) | Pale floor with physically based roughness and normal maps, scaled to real-world dimensions. | CC0; source gives approximately 80 × 80 cm. Start with 1K or 2K maps and inspect actual color under office light. |

Poly Haven explicitly permits modification and redistribution in its [license](https://polyhaven.com/license). ambientCG likewise permits inclusion of raw files in projects in its [license](https://docs.ambientcg.com/license/). Record exact versions, source URLs, authors, hashes and modifications in the shipped asset manifest; a catalog-level license does not replace checking a downloaded package.

## Candidates not approved for public bundling

- [Renderpeople free rigged / animated people](https://renderpeople.com/free-3d-people/) are a strong realism reference: scanned adults, skinned skeletons and FBX downloads. However, [terms sections 4.2–4.3](https://renderpeople.com/general-terms-and-conditions/) restrict transfer and making individual 3D files accessible. Do not place these assets in public Git or assume moving them to a public CDN resolves the restriction. Custom permission would need to cover the actual browser delivery and source redistribution.
- [Mixamo](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) supports commercial projects and automatic humanoid rigging, but the FAQ does not establish permission to redistribute a reusable raw animation/model library. Do not treat it as CC0 or bundle its raw assets without resolving that scope.
- [Blendkit / BlenderKit](https://www.blendkit.com/docs/licenses/) distinguishes CC0 from royalty-free assets. Evaluate exact CC0 listings; do not assume every free download permits public source redistribution.
- Voxel/low-poly toy character packs do not meet this art direction even when their license is convenient.

## Download inspected

Khronos `SheenWoodLeatherSofa.glb`, downloaded from the official sample asset repository:

- 10,107,912 bytes; 46,492 triangles; 6 meshes; 6 materials; 15 textures.
- Required extensions: `KHR_texture_transform`, `EXT_texture_webp`.
- No external image or buffer URIs in the GLB.
- SHA-256: `5349e042ad41e695e89f1110230c4ee0c75b2bc62ef830c7016be6ecf665bfb6`.
- Local evaluation file is under ignored `.local/asset-research/`; it has not been added to runtime or public source.
- Structural inspection does not verify appearance, frame rate or interaction quality.

## Integration order and acceptance

1. Build one adult engineer from licensed assets and one furnished workstation as a quality benchmark. Review face, hair, hands, seated posture, garment folds and actual keyboard contact at the real inspection camera distance before producing the rest of the staff.
2. Evaluate one imported chair or sofa and one realistic plant under the same lighting. Keep an intentional shared material palette; avoid the appearance of unrelated stock assets.
3. Bake unsupported authoring shaders into glTF-compatible maps. Use GLB for runtime, sensible texture sizes, and lower-detail geometry where distance permits. Suggested starting targets, not measured guarantees: 20–40K triangles per character, 1K maps for background props, 2K for close-up hero surfaces, and at least 30 FPS on the target laptop.
4. Keep product objects custom: board, engineering screen, ideas wall, four-stage conveyor, safe and ticker. Their screen surfaces, animation pivots, hit targets and evidence state must remain under application control.
5. Test overview plus all six inspections, transition midpoints, mobile layout and reduced motion. Reject clipped frames, floating furniture, detached screen controls, unreadable text, occluded gate signs and transparency sorting errors. Inspect the actual browser captures rather than accepting vendor renders.
6. Separate working / idle / blocked staff animations and connect operational activity to real state. Idle breathing and posture changes may be decorative; they must not imply an active provider session.

High-quality geometry will improve the room, but it will not by itself fix projection, light, contact shadows, color management or depth handling. Those must pass together in the running application.
