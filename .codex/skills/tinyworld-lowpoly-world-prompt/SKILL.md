---
name: tinyworld-lowpoly-world-prompt
description: Use when editing Tiny World Builder prompts, model-generated worlds, Auto suggestions, or any model behavior that should create coherent low-poly 3D board scenes.
---

# EtherWars Low-Poly World Prompting

The built-in model should act like a compact low-poly diorama designer, not a random tile filler.

Use `EtherWars` for game-facing prompt and UI language. Keep legacy
`tinyworld:*` keys, routes, skill folder names, and compatibility API names
until a dedicated alias/migration pass changes them.

Prompt principles:

- Generate should be text-only by default: use OpenAI `gpt-5.5` for validated
  world JSON and do not add an image-generation topology prepass unless the
  user explicitly asks for images again.
- Honour the selected generation board size. The Generate dialog can request
  any `HOME_GRID_OPTIONS` size, so prompts must include the requested
  `gridSize` and coordinate bounds instead of assuming 8x8.
- Floating chat prompts are additive patches by default. Unless the prompt
  explicitly asks to replace/reset/rebuild or starts with `/clear`, preserve the
  existing board and return only complete final-state cells that should be
  added or changed.
- Start from a readable scene concept: village, farm, canal, ridge, market, garden, tower district, or mixed landmark.
- Use strong silhouettes: tall/short contrast, clustered houses, towers, hills, trees, walls, and clear negative space.
- Make terrain do composition work: paths lead the eye, water creates crossings, dirt groups crops, grass gives breathing room.
- Treat hills and mountains as elevation/height through `terrainFloors`, not
  as a field of rock objects. Rocks are sparse landmarks or boulders only.
- Use adjacency intentionally: fences connect, bridges belong on water crossings, crops form fields.
- Avoid noise: do not fill every board cell; leave open cells and visible paths.
- Use `floors` as variation/intensity, including terrain stacking and object detail.
- House cells must use an explicit surviving `buildingType`: `tower` and
  `habitat` are civilian/shelter structures, while `skyscraper` displays as the
  military Command Center. Do not ask models to emit null/default houses.
- Keep output strictly machine-parseable JSON matching the schema.

Primitive assembly prompting:

- Tell models they cannot invent new object kinds, meshes, labels, or custom geometry in JSON.
- Ask them to translate requested objects into available primitives: terrain, raised terrainFloors, houses/building variants, fences/fenceSide, rocks, bridges, crops, tufts, and trees.
- Include concrete decompositions for non-native requests:
  - skate park = path/dirt plaza + raised terrain ramps + rocks as obstacles + fences as rails/edges + tufts/trees as landscaping.
  - market = path plaza + tower/habitat stalls + fences as queue rails + crops/pumpkins as goods.
  - playground = path/dirt base + rocks as play forms + fences as boundary + trees/tufts for park context.
  - quarry = raised dirt/grass terraces + rocks of varied floors + path access road + sparse tufts.
- Emphasize legibility from the default isometric camera: 3–5 clear assembled features beats many scattered cells.

Voxel stamp prompting:

- For new text/image-to-voxel stamps, prefer semantic `customParts` first instead
  of raw voxel clouds. This preserves editable object structure and avoids
  low-quality broad blocks.
- Include the allowed material list, selected/source object intent, source
  parts when available, image reference when present, `allowedBounds`, and a
  quality target that calls out connected layered detail.
- Use raw `{x,y,z,color}` voxels after a seed exists and the user asks to
  reinterpret/upscale/refine density; keep returned voxels bounded and omit
  hidden interior fill.
- Do not let a reference image or prior Japanese stamp bias unrelated objects
  into pagodas, gardens, torii, sakura, or shrine motifs unless explicitly
  requested.

For Auto suggestions:

- Return candidate actions, not coordinates.
- Suggestions should be reusable across several placements.
- Include a varied ranked batch: one structural option, one terrain/path option, one nature/detail option, and one intensify/repeat option when useful.
