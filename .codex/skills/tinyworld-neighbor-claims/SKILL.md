---
name: tinyworld-neighbor-claims
description: Use when changing EtherWars surrounding neighbor slots, open-land claim UI, claim glows, or neighbor ownership display.
---

# Tiny World Neighbor Claims

Neighbor lands are represented by `SURROUNDING_NEIGHBOR_SLOTS` in
`tiny-world-builder.html`. They are visual-only perimeter slots; do not write
claim behavior into `world[][]`, `cellMeshes`, ghost-board cells, battle logic,
resource decay, tournament elimination, or contract calls unless explicitly
requested.

Use these helpers for the UI-only claim flow:

- `isNeighborClaimable(neighbor)` decides whether an open slot can show claim
  affordances.
- `setNeighborClaimGlow(neighbor, enabled)` toggles the green claim glow.
- `claimNeighborLand(neighborId)` marks a slot as claimed by the current user
  in local/UI state.
- `expansionAvailable` comes from hydrated AWS mock/indexer state. When true,
  show the single player-panel Claim button and route it through
  `claimNextExpansionLand()`, which claims the first unoccupied neighbor slot
  in existing slot order or appends a visual-only open slot before claiming.
  Do not show per-neighbor open-land Claim buttons.
- Player-controlled land labels use the current player's deterministic star
  name: the synthetic Home entry is `<Star Name> Colony 1`; claimed expansion
  slots are `<Star Name> Colony 2` and `<Star Name> Colony 3`. Expansion slots
  are created only when claimed, capped at Colony 3, and the Claim Expansion
  button is visible only when the loaded public record contains the literal
  boolean `expansionAvailable: true`.
- `controlledLandState` stores the currently active player-controlled land and
  a map of saved land records. `home` is the original land; claimed neighbors
  use `neighbor:{slotId}`.
- `loadControlledLand(landId)` switches the visible board/resources/action
  draft after snapshotting the previously active land.
- The neighbor stats selector includes a synthetic Home land option using
  `HOME_NEIGHBOR_SELECTOR_ID`; do not add it to `neighborSlotById` or attack
  targets.
- `loadSelectedPanelLandFromAws()` fetches the bounded AWS inter-round draft and
  replaces only the selected controlled land from `interRoundState.lands`
  (falling back to legacy top-level home draft fields for Home).
- The Credits row opens the controlled-land credit transfer modal. Transfers
  move `resources.gold` between controlled land records, confirm before
  applying, persist local state, and then explicitly call `saveInterRoundStateToAws()`.
- The stats panel title is land-scoped UI. Keep it in the form
  `Land Stats (Home land)` or `Land Stats (<neighbor label>)` via
  `activeControlledLandLabel()` when active controlled land changes.
- When a claimed neighbor is the active controlled land, selecting or clicking
  that same perimeter slot should open the synthetic Home land stats option and
  still trigger the neighbor camera pivot. Selecting Home land from the
  dropdown while on a claimed neighbor should pivot toward that claimed
  neighbor slot too.

Keep attack targets restricted to occupied rival slots. A user-claimed neighbor
should stop reading as open/claimable, but should not become an attack target.
Claimed lands should start blank: no cells, no credits, and no resources.

AWS draft saves keep the legacy active-land fields (`proposedWorld`,
`proposedResources`, `roundAction`) and add multi-land data under
`interRoundState.activeLandId` and `interRoundState.lands`. Do not make S3
writes automatic from claim/switch operations; Save AWS Draft remains explicit.
Credit transfer is the exception because the user explicitly confirms a send.
Land switches should use the lightweight `.land-transition-overlay` loading
state so the board transition feels intentional.

Add `TODO(contract)` and `TODO(persistence/indexer)` comments wherever temporary
local claim state stands in for real ownership or durable hydration.
