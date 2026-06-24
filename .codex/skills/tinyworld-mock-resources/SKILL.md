---
name: tinyworld-mock-resources
description: Use when changing Tiny World Builder mock Resources state, User Stats resource display, or frontend-only building cost/effect rules.
---

# Tiny World Mock Resources

Use this while the Resources model is frontend/mock-state only.

- Keep mock `resources` in `tiny-world-builder.html` near the other mock player constants.
- Keep cost/effect rules in `RESOURCE_BUILD_RULES`; do not spread resource economics into individual mesh factories.
- Resource rewards are 1:1 with credit cost: every resource-producing
  `RESOURCE_BUILD_RULES` entry must keep its existing `cost.gold` unchanged
  and set its single resource `effect` to that same value. Upgrades, deletes,
  replacement refunds, AWS drafts, commit validation, and server validation all
  rely on this parity.
- `gold` is the spendable resource. Supported placements should call `trySpendMockResourcesForPlacement(selectedTool)` immediately before mutating world state.
- If a placement cannot afford its gold cost, return without calling `setCell()` or `addCellExtra()`.
- Erase refunds should derive from `RESOURCE_BUILD_RULES`, not a duplicated table. The Erase/trash tool removes one level per click, so refund/effect reversal should apply to one level at a time and clamp reversed resource effects at zero.
- Building replacement should reuse erase/refund accounting before the new
  placement spend. Replacing a resource-backed main object must refund every
  existing level and remove every level of its resource effect before charging
  and applying the incoming level-1 building. Keep this transactional: if the
  incoming spend fails after a refund, restore the previous resource snapshot.
- Resource placement audio should use the existing SFX helpers. Spend failures play the rejection clip in the spend helper; successes play after `setCell()` / `addCellExtra()` mutates the world.
- Update the User Stats panel through `RESOURCE_KEYS`, `setPlayerStat()`, and `updatePlayerStatsPanel()`.
- Placement feedback should stay in the mock resource layer: use `flashPlayerResourceStats()` from spend/refund helpers rather than scattering DOM animation calls through tool placement branches.
- Resource-backed blocked actions must separate low-credit failures from max-level failures. Insufficient gold should use `rejectMockResourceBuildAction(tool)` so Gold gets the red jiggle and rejection sound. Max-height / max-level repeat clicks should use `rejectMockResourceMaxLevelAction(tool)` so only the affected non-gold resource from the rule effect gets the red jiggle.
- Mock round-action UI can read `resources.gold` for attack wagers, but must remain frontend-only until commit/reveal and contract/indexer state are explicitly added.
- Local game state is persisted through `etherWars.localGameState.v1`.
  Resource changes, world cell intent, selected cells, round-action allocation
  state, and camera/tool metadata should flow through
  `getSerializableGameState()` / `saveLocalGameState()` rather than creating
  separate localStorage keys for individual resources.
- `fetchAwsMockStats()` must always hydrate the AWS `lastRevealState` from
  `GET /api/mockstats`, even when `etherWars.localGameState.v1` restored a
  browser-local draft first. Treat AWS as the authoritative baseline:
  `credits` maps to local `gold`, `fleet` maps to local `army`, and placement /
  erase helpers still mutate the frontend mock resources as a draft overlay.
  When restoring local game state, pass `{ preserveLocalResources: true,
  reconcileLocalDraft: true }` so valid local draft edits survive hydration.
- Validate local drafts only at major boundaries: after local/AWS load
  reconciliation, before Save AWS Draft, and before Commit preview/submission.
  Use `validateLocalDraftAgainstLastRevealState()` /
  `validateCurrentDraftAgainstAuthoritativeState()` for frontend feedback. Do
  not validate after each placement click. Frontend validation is advisory; the
  dev-server/AWS write path remains authoritative.
- The toolbar Clear button opens restore choices for state reconciliation:
  restoring last reveal clears local draft resources/world and deletes the
  bounded AWS inter-round draft; restoring last saved AWS state clears local
  changes and applies the saved draft's `proposedResources`, `roundAction`, and
  `proposedWorld`. Restore paths must persist the intended restored snapshot
  directly to both `tinyworld:v1` and `etherWars.localGameState.v1`, and repeat
  persistence from `applyState(..., { onDone })` so progressive rendering does
  not let stale autosave state survive a refresh. Also overwrite the active
  named-world slot in `tinyworld:worlds.v1`, because the world menu keeps a
  periodic snapshot that can otherwise preserve stale local draft changes.
- `buildInterRoundStateDraft()` may snapshot the current visual world and
  frontend mock resources into a proposed `interRoundState`, but saving must
  remain explicit through `saveInterRoundStateToAws()` / `POST
  /api/inter-round-state`; do not write to S3 from `setCell()` or resource
  spend/refund helpers.
- Leave contract, wallet, indexer, and elimination behavior out until explicitly requested.

Validation:

- Placing supported farm, water, shelter, wall/fence, or army tools spends gold and updates the matching resource immediately.
- Sheep and Cow are Food resource infrastructure. Sheep cost 20 credits and
  produce 20 Food per level; Cow cost 40 credits and produce 40 Food per level.
  Their visual `floors` upgrades should add smaller lambs/calves around the
  adult while relying on the same placement, replacement, refund, save/load,
  AWS draft, and 1:1 validation paths as other resource buildings.
- Building roles live in `RESOURCE_BUILD_RULES`: military buildings contribute
  `army`, civilian buildings contribute `shelter`. Keep UI labels, role color,
  cost text, placement spending, erase refunds, stat/resource accounting, and
  the 1:1 cost/effect rule derived from that central table.
- Command Center (`highrise` / `skyscraper`) is a civilian shelter building:
  cost 30 credits and produce 30 Shelter. Air Command remains the military
  house variant.
- Oxygen Generation Plant is a resource-backed non-house building in
  `RESOURCE_BUILD_RULES`: it spends `gold`, contributes `oxygen`, upgrades
  through the generic repeat-click `floors` path, and relies on
  `OXYGEN_PLANT_MAX_LEVEL` / `maxFloorsForKind()` to reject max-level clicks
  before spending.
- Water Generation Plant is the water counterpart to Oxygen Generation Plant:
  keep its geometry, footprint, level cap, costs, repeat-click upgrades, erase
  refunds, thumbnails, and save/load behavior mirrored through the shared
  generation-plant helpers, but route its `RESOURCE_BUILD_RULES` effect to
  `water`.
- Replacing a leveled Oxygen Generation Plant with a Water Generation Plant
  should refund all oxygen-plant levels, remove all oxygen output, then charge
  and apply one water-plant level. The same replacement accounting applies to
  habitats/shelter, fleet/army buildings, voxel resource stamps, and house
  building-type swaps.
- Grass, Dirt, Tree, Tuft, Flower, and Bush are also oxygen-backed rules in
  `RESOURCE_BUILD_RULES`. Keep them on the same placement/refund helpers as
  Oxygen Generation Plant rather than directly mutating oxygen stats.
- Insufficient gold blocks placement and leaves the world unchanged.
- Unsupported decorative tools keep normal world-builder behavior.
