# Code Context

## Files Retrieved
1. `AGENTS.md` (lines 1-121) - repo workflow, style rules, data-layer contract, Three.js constraints, quick checks.
2. `README.md` (lines 1-79) - run/deploy commands, controls, public architecture summary, documented tools.
3. `package.json` (lines 1-24) - npm scripts (`build`, `check`, `test`) and dependency posture.
4. `package-lock.json` (lines 1-14) - confirms no installed package dependencies are declared.
5. `publish.sh` (lines 1-114) - static dist build, sanity checks, asset copy behavior, optional zip.
6. `vercel.json` (lines 1-21) - Vercel build command/output directory and headers.
7. `world.schema.json` (lines 1-73) - external JSON schema used as documented world contract.
8. `tiny-world-builder.html` (lines 1-80) - document head, fonts, root CSS start.
9. `tiny-world-builder.html` (lines 2734-2813) - Cluso embed config/module and main DOM shell start.
10. `tiny-world-builder.html` (lines 3461-3600) - Three.js/CDN includes, constants, grid limits, render localStorage keys.
11. `tiny-world-builder.html` (lines 3654-4216) - renderer/stage sizing, post-processing, stats, cameras, lighting, geometry/material setup.
12. `tiny-world-builder.html` (lines 4353-6530) - tile factory, object factories, house primitives/assemblers.
13. `tiny-world-builder.html` (lines 6530-6767) - `world`, `cellMeshes`, selection model, default/ensure helpers.
14. `tiny-world-builder.html` (lines 7670-8046) - adjacency helpers for paths, terrain, rocks, bridges, fences, castle promotion, house clustering.
15. `tiny-world-builder.html` (lines 8046-8510) - renderers, extras, `setCell`, adjacency refresh, disposal.
16. `tiny-world-builder.html` (lines 8510-8804) - initial scene, hover, ghost placement preview, raycaster start.
17. `tiny-world-builder.html` (lines 8804-9340) - tool registry/groups and toolbar thumbnail rendering.
18. `tiny-world-builder.html` (lines 9340-9568) - click/place/erase flow, `applyTool`, auto tool entry.
19. `tiny-world-builder.html` (lines 9568-10431) - pointer/orbit controls, export/import, camera modes, first-person, reset/clear.
20. `tiny-world-builder.html` (lines 10431-11937) - render settings, audio, smoke/dust/clouds/weather/crop-duster/banner systems, animation loop.
21. `tiny-world-builder.html` (lines 11937-12884) - embedded `WORLD_SCHEMA`, AI provider defaults, prompts, validation, procedural generation.
22. `tiny-world-builder.html` (lines 13882-14478) - localStorage persistence, migration, `applyState`, webhooks/SSE bridge, `loadState`.
23. `tiny-world-builder.html` (lines 14478-15035) - welcome dialog, profile/build saves, optional auth handling.
24. `tiny-world-builder.html` (lines 15035-16095) - boot, minimap, view/time/dev popups, world-name slots, command palette.

## Key Code

```js
// tiny-world-builder.html lines 6530-6554
const world = [];
const cellMeshes = {}; // 'x,z' -> { tile, object }
for (let x = 0; x < HOME_GRID_MAX; x++) {
  world[x] = [];
  for (let z = 0; z < HOME_GRID_MAX; z++) world[x][z] = { terrain: 'grass', terrainFloors: 1, kind: null, floors: 1, buildingType: null, fenceSide: null, extras: [] };
}
```

```js
// tiny-world-builder.html lines 8046-8510
function renderCellTile(x, z, opts) { ... makeTile(...); ... }
function renderCellObject(x, z, opts) { ... dispatches kind -> makeTree/makeRock/makeHouse/etc ... }
function setCell(x, z, opts) {
  // normalizes terrain/kind, writes world[x][z], rebuilds tile/object,
  // refreshes adjacency-sensitive neighbours/clusters, then saveState().
}
```

```js
// tiny-world-builder.html lines 8804-8876, 9340-9568
const TOOLS = [ ... terrain tools, house/fence variants, crops, animals, erase ... ];
function applyTool(x, z) { ... selectedTool -> setCell/addCellExtra/popCellExtra ... }
```

```js
// tiny-world-builder.html lines 13882-14246
const STORAGE_KEY = 'tinyworld:v1';
const STORAGE_VERSION = 4;
function saveState() { ... localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 4, gridSize: GRID, cells, cameraMode, toolId })) ... }
function applyState(data, opts = {}) { ... validates, accepts tuple/object cells, restores gridSize, calls setCell in chunks ... }
```

```bash
# publish.sh lines 44-62, 69-90
# Parses inline JS with new Function, parses world.schema.json,
# then copies HTML/schema/README/LICENSE, screenshots, sounds/, and models/ into dist/.
```

## Architecture

- **App shape:** one static HTML file with inline CSS and a large inline JS app. Runtime dependencies are CDN Three.js r128 and GLTFLoader (`tiny-world-builder.html` lines 3461-3463), plus a local Cluso module in the head (`cluso/cluso-embed.js`, lines 2734-2745).
- **State/render split:** `world[x][z]` is intent; `cellMeshes['x,z']` is rendered Three.js state. `setCell()` is the central mutation path and is responsible for normalization, mesh rebuilds, neighbor refreshes, autosave, and webhooks.
- **Rendering:** tile terrain comes from `makeTile`; props/buildings come from object factories and house assemblers. Adjacency helpers feed path joins, shorelines, bridge orientation, rock outcrops, fence/castle walls, and house cluster shapes.
- **Input flow:** pointer/raycaster selects a cell; `applyToolToCell()` handles home vs ghost-board clicks; `applyTool()` maps selected tool/variant/repeat-click behavior to `setCell()` or extras.
- **Persistence/import/export:** EtherWars local autosave currently uses the legacy compatibility key `tinyworld:v1` with schema version 4, sparse serialized cells, `gridSize`, `cameraMode`, and `toolId`. `applyState()` accepts both compact tuple export and object-form schema cells.
- **Generation/automation:** AI generation sends embedded `WORLD_SCHEMA` plus prompts to OpenAI/Anthropic/xAI endpoints from browser-local API keys, validates with a lightweight validator, then loads via `applyState()`.
- **Deploy:** `npm run build` runs `publish.sh`; Vercel serves `dist/` per `vercel.json`. Assets under `sounds/` and `models/` are copied; screenshots go to `dist/assets/`.

## Start Here

Open `tiny-world-builder.html` at lines 8046-8510 first. That range contains `renderCellTile`, `renderCellObject`, `renderCellExtras`, and `setCell()`—the main state-to-render contract every feature eventually uses.

## Risks / Inconsistencies

- `README.md` and `AGENTS.md` still describe an ~1600-line JS app and 8x8-only assumptions; the file is 16,095 lines and supports `GRID` up to 48 (`tiny-world-builder.html` lines 3474-3484).
- `world.schema.json` is stricter than runtime/export: no `gridSize`, tuple cells, `extras`, `transform`, negative/out-of-home coordinates, or `cameraMode: 'soft'/'fp'`, while the app saves/accepts several of these.
- External/embedded schema camera enum is only `ortho`/`perspective`, but default/exported runtime `cameraMode` can be `soft`.
- Schema/docs say water should not host kinds except bridge; `setCell()` allows rocks on water and `makeRock(..., inWater)` has a water rendering path.
- `publish.sh` does not copy the `cluso/` directory even though the HTML imports `cluso/cluso-embed.js`; deployed `dist/` may 404 that module.
- `package.json` `check` only syntax-checks the final inline script and parses `world.schema.json`; it does not verify schema parity, referenced assets, CDN availability, or browser runtime behavior.
- `package.json` has `main: "index.js"` but no such source file; harmless for static deploy, confusing for package consumers.
- Optional account/profile cloud-save code calls `/api/profile` and `/api/builds`; no source API functions were found in the repo root. Static mode hides this unless `window.TinyWorldAuth` is present.
