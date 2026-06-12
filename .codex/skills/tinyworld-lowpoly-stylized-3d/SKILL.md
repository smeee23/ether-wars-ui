---
name: tinyworld-lowpoly-stylized-3d
description: Use when adding, importing, designing, reviewing, or animating low-poly / stylized 3D assets in Tiny World Builder, including Three.js procedural meshes, GLB/GLTF assets, Poly Pizza models, material palettes, scale/orientation, silhouettes, clouds/planes/crop dusters, and toolbar thumbnails.
---

# Tiny World Low-Poly Stylized 3D

Use this together with:

- Project skill `.codex/skills/tinyworld-single-file/SKILL.md` for single-file constraints.
- Project skill `.codex/skills/tinyworld-render-performance/SKILL.md` for GPU/shadow/renderer limits.
- Installed skill `.agents/skills/3d-modeling/SKILL.md` for topology, UV, export, LOD, and GLB hygiene.
- Installed skill `.agents/skills/poly-pizza-api/SKILL.md` when sourcing low-poly models from Poly Pizza.
- Installed skill `.agents/skills/lightweight-3d-effects/SKILL.md` when adding decorative lightweight 3D effects.

## Tiny World art direction

- Low-poly, toy-like, readable at thumbnail size.
- Chunky primitives with bevels/rounded slabs, not realistic detail.
- Strong silhouettes beat micro-detail.
- Bright but not washed out: use saturated local color plus darker trim/shadow-side material.
- Keep texture use rare and intentional. Procedural `THREE.MeshLambertMaterial` colors should remain the default for built-in objects.
- Use flat/Lambert lighting semantics compatible with Three.js r128.
- Avoid glossy/PBR realism unless an imported asset already depends on it.

## Scale rules

- One grid tile is `1 x 1` world unit.
- Small props should fit comfortably inside a tile: ~0.2–0.8 units wide.
- Houses can occupy one or multiple tiles, but doors/windows must remain readable from the default camera.
- New single-cell building variants should usually be `kind: 'house'` with a `buildingType`, rendered by a shared voxel/procedural factory and added to the House tool variants, schema enums, ghost preview, thumbnails, ghost rendering, and mock resource rules.
- Building variants derived from a voxel stamp can use a hidden internal stamp plus a dedicated house factory. Keep the stamp hidden from generic voxel-build pickers when the building must place/save as `kind: 'house'`.
- Flying ambient objects should be scaled to feel like toys above the board, not real-world aircraft; crop duster wingspan target is around 1–1.5 tiles.
- Rooftop defensive visuals should be separate visual-only factories with named subgroups for future rotation/tracking; do not add firing, damage, projectile, or combat behavior unless explicitly requested.
- Level-gated rooftop visuals should derive from existing `floors` / build level state and shared helpers, not new saved fields; keep thresholds consistent across detailed, voxel, ghost, and thumbnail render paths.
- If visual tracking is requested, keep it set-based in the animation loop, rotate only the named yaw/root group, and treat existing flying scene roots as targets without adding combat state.
- Board-level decorative landforms, such as a floating asteroid underside, should live as standalone `worldGroup` children with `userData.visualOnly`, no `gx/gz` raycast metadata, and no writes to `world`, `cellMeshes`, `setCell`, `tilePos`, or `makeTile`.
- Curved decorative landforms should reuse the existing terrain-side material palette when possible, and can be split into static low-poly material bands for lit rim, mid rock, and shadow body instead of adding lights or post-processing.
- Always normalize imported model scale with `Box3` bounds, then apply a target span.
- Apply orientation fixes once at model root or a named wrapper; do not keep stacking ad-hoc rotations in the animation loop.

## Material and palette rules

- Prefer 2–4 materials per object: body, dark trim, highlight, accent.
- Never mutate shared `M.*` material colors for one instance; clone or create a new material. The one allowed global exception is `applySeasonFoliage()`, which centrally retints shared foliage/grass materials for season changes.
- Sci-fi crop/building shields should reuse `M.greenhouseGlass` / `makeForceShieldMaterial()` so pulse, Fresnel rim, opacity, and fade-cache uniform syncing stay shared and cheap.
- When voxel stamps need to match built-in procedural structures, prefer passing targeted material overrides that reuse shared `M.*` materials instead of copying equivalent hex colors into the voxel palette.
- For imported texture variants, create explicit material variants and swap them at the model mesh level.
- For toolbar thumbnails, increase contrast/saturation carefully so icons read against the white toolbar, but keep the in-world material natural.
- For building toolbar thumbnails, use the shared Box3-based thumbnail normalizer instead of per-building camera or Y-offset tweaks. Center by rendered bounds, scale by the largest rendered dimension, and align the bounding-box bottom to the shared tile baseline so large stamps like Air Command and Crystal Weapons Platform do not dominate.
- If a model comes with a texture atlas, set `texture.encoding = THREE.sRGBEncoding` and check `flipY` for GLTF compatibility.

## Model import hygiene

- Keep assets under `models/` and ensure `publish.sh` copies them to `dist/models/`.
- Use `THREE.GLTFLoader` from the Three.js r128 examples CDN if loading GLB/GLTF in the single HTML file.
- After loading:
  1. compute `Box3`, center model at origin,
  2. scale to target tile/world size,
  3. set cast/receive shadow intentionally,
  4. tag moving subparts in `userData`,
  5. dispose cloned materials/geometries if removed.
- Search named nodes before doing geometry surgery. Common names: `prop`, `propeller`, `blade`, `rotor`, `fan`, `wheel`, `flap`.

## Animation rules

- Animate only transforms and opacity.
- Respect the existing `userData.landing` pattern for placed cell objects.
- For propellers: wrap or find the named prop mesh, spin around its local blade axis every frame, and add a translucent disc for high-RPM readability.
- For aircraft: use shallow easing, pitch with climb/descent slope, and bank during turns. Do not teleport or dive straight down into the board.
- Aircraft route targeting should use named live index helpers for the intended destination type, such as `airCommandPositions` plus `getAirCommandFlightTarget()`, instead of reusing unrelated gameplay indexes like crops.
- For first-pass vehicle conversions, prefer additive primitives attached after GLB load over editing/replacing the GLB. Keep the existing flight root, path state, speed, scale, and update loop intact; hide obsolete named nodes such as propellers only when the GLB hierarchy can remain in place.
- Particle effects should be capped and use cheap cloned `MeshBasicMaterial`; dispose particle materials when particles die.

## Validation checklist

- Inline script passes: `perl -0ne 'print $1 if m#<script>\s*(.*?)\s*</script>#s' tiny-world-builder.html | node --check`.
- `./publish.sh` copies any new assets into `dist/`.
- Default camera shows the asset at the intended scale.
- Shadows are visible but not noisy; no huge new shadow casters.
- Toolbar thumbnail remains readable.
- No material mutation leaks into other objects.
