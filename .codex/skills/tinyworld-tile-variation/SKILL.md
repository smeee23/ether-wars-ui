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
- Terrain tools on empty terrain cells should stack height using `terrainFloors`.
- Raised terrain should lift the tile top and any object on that cell via `terrainRiseAt`.
- Terrain height changes must rebuild the visible tile mesh immediately, even when terrain/kind did not change.
- Object intensity changes must rebuild the object mesh, not the ground mesh.
- Object variations should remain the same `kind` unless a schema change is explicitly requested.
- Same-kind rock neighbours should blend by neighbour strength, not render as identical stamped cells.

Fence levels:

- `1`-`4`: stone/rock wall by default; the saved level still increments for repeat-click behavior.
- `5+`: steel wall.

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
