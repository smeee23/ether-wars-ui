---
name: tinyworld-mock-resources
description: Use when changing Tiny World Builder mock Resources state, User Stats resource display, or frontend-only building cost/effect rules.
---

# Tiny World Mock Resources

Use this while the Resources model is frontend/mock-state only.

- Keep mock `resources` in `tiny-world-builder.html` near the other mock player constants.
- Keep cost/effect rules in `RESOURCE_BUILD_RULES`; do not spread resource economics into individual mesh factories.
- `gold` is the spendable resource. Supported placements should call `trySpendMockResourcesForPlacement(selectedTool)` immediately before mutating world state.
- If a placement cannot afford its gold cost, return without calling `setCell()` or `addCellExtra()`.
- Erase refunds should derive from `RESOURCE_BUILD_RULES`, not a duplicated table. The Erase/trash tool removes one level per click, so refund/effect reversal should apply to one level at a time and clamp reversed resource effects at zero.
- Resource placement audio should use the existing SFX helpers. Spend failures play the rejection clip in the spend helper; successes play after `setCell()` / `addCellExtra()` mutates the world.
- Update the User Stats panel through `RESOURCE_KEYS`, `setPlayerStat()`, and `updatePlayerStatsPanel()`.
- Placement feedback should stay in the mock resource layer: use `flashPlayerResourceStats()` from spend/refund helpers rather than scattering DOM animation calls through tool placement branches.
- Resource-backed blocked actions, including insufficient gold and max-height repeat clicks, should use `rejectMockResourceBuildAction(tool)` so Gold gets the same red jiggle and rejection sound.
- Mock round-action UI can read `resources.gold` for attack wagers, but must remain frontend-only until commit/reveal and contract/indexer state are explicitly added.
- Leave contract, wallet, indexer, and elimination behavior out until explicitly requested.

Validation:

- Placing supported farm, water, shelter, wall/fence, or army tools spends gold and updates the matching resource immediately.
- Building roles live in `RESOURCE_BUILD_RULES`: military buildings contribute
  `army`, civilian buildings contribute `shelter`. Keep UI labels, role color,
  cost text, placement spending, erase refunds, and stat/resource accounting
  derived from that central table.
- Oxygen Generation Plant is a resource-backed non-house building in
  `RESOURCE_BUILD_RULES`: it spends `gold`, contributes `oxygen`, upgrades
  through the generic repeat-click `floors` path, and relies on
  `OXYGEN_PLANT_MAX_LEVEL` / `maxFloorsForKind()` to reject max-level clicks
  before spending.
- Grass, Dirt, Tree, Tuft, Flower, and Bush are also oxygen-backed rules in
  `RESOURCE_BUILD_RULES`. Keep them on the same placement/refund helpers as
  Oxygen Generation Plant rather than directly mutating oxygen stats.
- Insufficient gold blocks placement and leaves the world unchanged.
- Unsupported decorative tools keep normal world-builder behavior.
