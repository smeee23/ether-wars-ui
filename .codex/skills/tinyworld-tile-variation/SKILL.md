---
name: tinyworld-tile-variation
description: Use when adding or changing Tiny World Builder tile/object repeat-click behavior, terrain stacking, floors/intensity, fences, rocks, walls, crops, or Monument Valley-like height/detail growth.
---

# Tiny World Tile Variation

Use separate terrain and object layers:

- `terrainFloors`: ground height only.
- `floors`: object/building intensity only.

Expected behavior:

- Re-clicking the same object kind increases `floors` up to `MAX_FLOORS`.
- Oxygen Generation Plant is a specific exception: re-clicking increases
  `floors` up to `OXYGEN_PLANT_MAX_LEVEL` (6), then stops.
- Tree is a specific exception: re-clicking/building is capped at level 1.
- Natural flora tools (Tree, Tuft, Flower, Bush) should force grass beneath
  them through `terrainOverride: 'grass'`, including Tuft's decorative-extra
  placement path.
- Terrain tools on empty terrain cells should stack height using `terrainFloors`.
- The Erase/trash tool peels one level at a time: extras first, then object
  `floors`, then the object itself at level 1, then terrain height/material.
- Water terrain is the flat-terrain exception: manual water placement is capped
  at `terrainFloors: 1`, and repeat-click attempts should reject through the
  same mock resource feedback used for blocked builds.
- Raised terrain should lift the tile top and any object on that cell via `terrainRiseAt`.
- Terrain height changes must rebuild the visible tile mesh immediately, even when terrain/kind did not change.
- Object intensity changes must rebuild the object mesh, not the ground mesh.
- Object variations should remain the same `kind` unless a schema change is explicitly requested.
- Same-kind rock neighbours should blend by neighbour strength, not render as identical stamped cells.
- Crop/terraform greenhouse side masking must compare the same panel profile
  that is actually rendered. If tree boxes render at crop-dome height, their
  adjacency profile must also be crop-dome height, and out-of-bounds neighbors
  must not be treated as default terrain.

Fence levels:

- Normal fences render as two small greenhouse-style posts with a shared
  `M.greenhouseGlass` force-shield panel between them; the saved level still
  increments for repeat-click behavior.
- Fences on path terrain render as road gates. Path axis means travel
  direction (`x` for east/west, `z` for north/south); gate posts and beams
  must span the perpendicular axis so the path passes through the opening.

Implementation guardrails:

- Do not add new saved fields unless necessary; prefer `floors`. Per-cell visual-only overrides may use `appearance` when the user explicitly needs immediate editable colours (e.g. tower `bodyColor` / `topColor`).
- If adding a new visual variation, route it through the factory for the existing `kind`.
- Rock and hill variants need visible contact skirts/talus at tile level so stacked or connected geometry reads grounded.
- Connected fence/wall rails should overlap tile boundaries slightly; never leave visible gaps in a run.
- Do not let `addEnhancementBits` double-scale a kind that now handles its own levels internally.
- Do not use object `floors` to raise ground. Old saves may overload `floors`; migrate object cells to `terrainFloors: 1`.

Validation:

- Same-kind manual placement should visibly change detail/height.
- Repeated terrain placement on an empty cell should raise the tile.
- Repeated object placement should keep `terrainFloors` unchanged and alter only the object.
- Objects should sit on raised terrain when rendered.
- Selection-panel property chips should apply immediate local changes through `setCell` when the renderer supports the property; do not fake direct controls by only writing prompts.
- Houses placed on `path` or `water` must preserve that terrain and render on an underpass/stilt base; do not coerce those tiles back to grass.
- Same-terrain repeat placement should be visible before refresh/reload.
