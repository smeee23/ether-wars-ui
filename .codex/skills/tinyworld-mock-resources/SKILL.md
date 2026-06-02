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
- Erase refunds should derive from `RESOURCE_BUILD_RULES`, not a duplicated table. Multiply refunds/effect reversals by the stored build level (`floors` for objects, `terrainFloors` for repeated resource terrain), then clamp reversed resource effects at zero.
- Resource placement audio should use the existing SFX helpers. Spend failures play the rejection clip in the spend helper; successes play after `setCell()` / `addCellExtra()` mutates the world.
- Update the User Stats panel through `RESOURCE_KEYS`, `setPlayerStat()`, and `updatePlayerStatsPanel()`.
- Mock round-action UI can read `resources.gold` for attack wagers, but must remain frontend-only until commit/reveal and contract/indexer state are explicitly added.
- Leave contract, wallet, indexer, and elimination behavior out until explicitly requested.

Validation:

- Placing supported farm, water, housing, wall/fence, or tower tools spends gold and updates the matching resource immediately.
- Insufficient gold blocks placement and leaves the world unchanged.
- Unsupported decorative tools keep normal world-builder behavior.
