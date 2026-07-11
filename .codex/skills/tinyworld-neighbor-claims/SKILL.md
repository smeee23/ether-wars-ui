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
- `expansionAvailable` comes from hydrated AWS mock/indexer state. When it is
  the literal boolean `true`, show the single player-panel Claim button and
  route it through `claimNextExpansionLand()`, which activates the first
  missing player colony in `playerPublicColonies`. Never append a player colony
  to `SURROUNDING_NEIGHBOR_SLOTS`; those slots are rival players only.
- Player-controlled land labels use the current player's deterministic star
  name, while the compact player toggle displays Colony 1/2/3. The three
  player toggle positions always exist, but inactive positions render a clear
  empty state. `colonyNavigationState.selectedPlayerColonyIndex` changes the
  editable controlled-land context with `keepCamera: true` and never calls the
  neighbor pivot.
- `controlledLandState` stores the currently active player-controlled land and
  a map of saved land records. `home` is the original land; claimed neighbors
  use `neighbor:{slotId}`.
- `loadControlledLand(landId)` switches the visible board/resources/action
  draft after snapshotting the previously active land.
- The neighbor selector contains actual table-assigned rival players only.
  `colonyNavigationState.selectedNeighborPlayerId` chooses the distant player
  and is the only selection path that may call `pivotCameraTowardNeighbor()`.
  `selectedNeighborColonyIndex` chooses one of that player's three normalized
  public colony records without moving the camera.
- Landlord public records are expected to expose a public `contractAddress`.
  Show it below the player and selected-neighbor colony toggles, preferring a
  colony-level override when present and otherwise using the record-level
  address. A displayed address is informational and not ownership authority.
- `loadSelectedPanelLandFromAws()` fetches the bounded AWS inter-round draft and
  replaces only the selected controlled land from `interRoundState.lands`
  (falling back to legacy top-level home draft fields for Home).
- The Credits row opens the controlled-land credit transfer modal. Transfers
  move `resources.gold` between controlled land records, confirm before
  applying, persist local state, and then explicitly call `saveInterRoundStateToAws()`.
- Current/Open Land and Load AWS Land controls live beside the player colony
  toggle and resolve their context through `selectedPanelControlledLandId()`.
  Do not move them back into the neighbor selector.
- The upper-left brand identifies the current player as
  `EtherWars - <Star Name>`. Update it through
  `updateActiveLandBrand()` when `loadControlledLand()` changes the active
  controlled land; highlighting a stats toggle alone must not rename the open
  surface.

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
