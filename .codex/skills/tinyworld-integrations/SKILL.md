---
name: tinyworld-integrations
description: Use when changing Tiny World Builder API, webhook, SSE, MCP, plugin, or automation examples.
---

# EtherWars Integrations

Use `EtherWars` for game-facing integration docs and descriptions. Keep legacy
compatibility identifiers such as `tinyworld_*`, `TINYWORLD_*`,
`tiny-world-builder`, and webhook `{ source: 'tiny-world-builder' }` until a
dedicated alias/migration pass updates both producers and consumers.

The app has browser-local integration points, not a backend API:

- Outbound webhooks live in `tiny-world-builder.html` under
  `// -------- API / webhooks / SSE bridge --------`.
- `fireWebhook(event, payload)` batches editor mutations and POSTs
  `{ source: 'tiny-world-builder', events }` to the configured Developer-panel
  webhook URL.
- Inbound automation uses `EventSource` against the configured Developer-panel
  SSE URL. Each SSE `data:` payload must be one JSON command accepted by
  `applyRemoteCommand`.
- Supported inbound ops include `place` / `set_cell`, `clear`, `reset`, plus runtime-only vehicle controls: `vehicle_spawn`, `vehicle_set_goal`, `vehicle_controls`, `vehicle_remove`, and `vehicle_clear`.
- Runtime vehicles must not pass through each other. Keep traffic behavior in the runtime layer: collision radius + yield radius, brake when another vehicle is inside the envelope, and reroute around occupied road cells after a short blockage when an alternate road path exists.
- Placed objects on paths are live traffic blockers. `isVehicleDrivableCell` should allow path cells only when the main `kind`/extras do not occupy the tile, while bridge cells remain drivable. Call `refreshVehiclesForWorldObstacleChange` from world edit paths so active auto vehicles reroute immediately when the user drops or removes an obstacle.

Future AWS/indexer round-state architecture:

- `S3ReadWrite.py` is the repo-local Ether Wars S3 utility. It must load local
  `.env` values without printing them, prefer standard `AWS_*` credential
  environment variables, only support explicit object read/write operations, and
  keep `.env` ignored.
- The local dev bridge exposes `GET /api/mockstats` from `tools/dev-server.js`.
  It shells through the project Python/venv to `S3ReadWrite.py` and returns the
  strict JSON from `s3://justcausepools/etherwars/mockstats.json`. Keep AWS
  keys out of `tiny-world-builder.html` and all browser-visible JavaScript.
  The browser must always hydrate this AWS `lastRevealState` on page load, even
  after a localStorage draft restore. Local state is a draft overlay; AWS is the
  authoritative baseline for Save AWS Draft and Commit boundary checks.
- The local dev bridge also exposes explicit, user-triggered
  `POST /api/inter-round-state` writes. Keep this path read/write bounded:
  validate commit phase, player id, round number, basic resource bounds, and
  only write to
  `etherwars/players/{playerId}/round-{roundNumber}/interRoundState.json`.
  Never call it from `setCell()` or other per-edit paths.
- The bridge also supports explicit user-triggered `GET` and `DELETE` for that
  same bounded inter-round key. Use `GET` to restore the last saved AWS draft
  into local state, and `DELETE` when the user chooses to restore the last
  reveal baseline and discard the pending AWS draft. Do not expose arbitrary S3
  keys to browser-visible JavaScript.
- Reveal round ends.
- Indexer reads contract results.
- AWS stores `lastRevealState`, the authoritative starting point for the next commit round:
  - credits
  - food
  - water
  - oxygen
  - shelter
  - fleet / army
  - population
  - round number
  - player status
  - previous world snapshot
- Commit round begins.
- User edits the visual world, chooses attack/defend/build actions, and allocates credits.
- AWS stores `interRoundState`, the proposed/pending state for the current commit round:
  - proposed world
  - proposed allocations
  - proposed wager
  - validation result
- User commits the action hash on-chain.
- During reveal, the contract verifies the revealed action against the allowed starting resources from `lastRevealState`.
- Indexer stores the new authoritative `lastRevealState` after contract results finalize.

When adding reconciliation, treat AWS/indexer `lastRevealState` values as authoritative. The client `world` remains visual intent, and any mock/local resource object is only a fallback or optimistic/pending layer. Compare world-derived resources against authoritative resources to show mismatches, but do not silently mutate authoritative balances from local visual edits.

Examples live under `plugins/examples/`:

- `webhook-receiver.js` captures outbound webhook batches.
- `sse-command-relay.js` exposes `/sse` for the browser and `/command` for
  external clients.
- `send-command.js` is a small CLI for the relay.
- `mcp-stdio-bridge.js` is a dependency-free MCP stdio server that calls the
  relay and reads the webhook log.
- `vehicle-road-demo.js` is a dependency-free MCP client/demo runner that talks
  to `mcp-stdio-bridge.js`, paints a visible road/water/bridge network, spawns
  runtime vehicles, and retargets them in a loop so the browser remains
  watchably active.
- The app also supports browser-native shareable vehicle demo URLs:
  - `?demo=vehicles&seed=tide-ridge-428` creates the small/default visible road demo.
  - `?demo=vehicles-large&seed=metro-culdesac-128&stats=1` creates the default 128×128 scale test with arterial/ring roads, bridge crossings, 200+ cul-de-sac endpoints, and 36 autonomous vehicles on long routes.
  - Large-demo params: `size=` / `mapSize=` / `grid=` / `gridSize=` accept the nearest valid demo grid size from `12` through `256` (`12`, `16`, `20`, `32`, `48`, `64`, `96`, `128`, `256`); `cars=` / `carCount=` / `vehicles=` / `vehicleCount=` accept `1..120` and are capped by available unique endpoints.
  Keep these demos visually self-identifying: show an active badge, hide overlays
  that cover the road network, and make vehicles obvious with beacons/markers.
  During local demo work, `tools/dev-server.js` should make bare
  `http://localhost:3000/` and no-query `http://localhost:3000/tiny-world-builder`
  redirect to the small seed so the user can simply open the port or remembered
  app URL and watch it. Use the large URL explicitly for scale/perf checks.

When changing command shape, update the app bridge and these examples together.
