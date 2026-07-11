# AGENTS.md

Guidance for AI coding agents working in this repo. Read this before touching
`tiny-world-builder.html`.

## Project shape

- Main app: `tiny-world-builder.html`. Inline CSS in `<style>`, inline JS in a
  single `<script>` block at the bottom. Three.js **r128** and GLTFLoader are
  self-hosted under `vendor/three/` and copied to `dist/` by `publish.sh`.
  Vercel (`vercel.json`) and Netlify (`netlify.toml`) both use that same static
  build output.
- No bundler and no npm runtime dependencies. Use `npm test` for static checks,
  `npm run build` for dist generation, then reload the browser.
- If a `tiny-world-builder BACKUP.html` snapshot exists, don't auto-update it.

## Repo-local skills

- Local skills live in `.codex/skills/*/SKILL.md`. Read the relevant skill before
  changing the matching system.
- When a change creates a durable pattern, update the related skill in the
  same turn. If there is no related skill, create a new concise one.
- Current skill routing:
  - `.codex/skills/tinyworld-single-file` — repo workflow and single-file constraints.
  - `.codex/skills/tinyworld-auto-batching` — Auto palette inference/cache behavior.
  - `.codex/skills/tinyworld-opacity-torch` — ghost boards, panning, opacity torch.
  - `.codex/skills/tinyworld-tile-variation` — repeat-click levels and terrain/object variation.
  - `.codex/skills/tinyworld-visual-qa` — browser checks and visual QA.
  - `.codex/skills/tinyworld-render-performance` — renderer, shadows, clouds, and GPU budget.
  - `.codex/skills/tinyworld-webxr` — WebXR AR desk placement, floating boards, VR immersion, and headset input.
  - `.codex/skills/tinyworld-crowd-layer` — 2.5D people sprites placed at 3D map coordinates.
  - `.codex/skills/tinyworld-lowpoly-world-prompt` — model prompting for coherent low-poly worlds.
  - `.codex/skills/tinyworld-lowpoly-stylized-3d` — low-poly/stylized 3D asset design, imports, materials, scale, and animation.
  - `.codex/skills/tinyworld-integrations` — API, webhook, SSE, MCP, plugin, and automation examples.

## House style

- Vanilla ES6+, no semicolons would be wrong here — **this file uses
  semicolons**, follow the existing style.
- 2-space indent, trailing commas where present, single quotes for strings.
- Section comments are `// -------- name --------` and they matter — keep
  related code grouped under them. If you add a new system, give it its own
  section header.
- Boring obvious code over clever. The app is now feature-rich (~16k LoC), so
  prefer small, well-sectioned changes over clever abstractions.

## Mental model

Two parallel data structures:

```
world[x][z]                  // intent  — { terrain, terrainFloors, kind, floors }
cellMeshes['x,z']            // render — { tile: Group, object: Group|null }
```

Mutate via **`setCell(x, z, opts)`**. It:

1. updates `world[x][z]`,
2. rebuilds the tile mesh if terrain / terrainFloors changed (or `forceTile` is set),
3. rebuilds the object mesh,
4. re-renders adjacency-sensitive neighbors (fences, house clusters).

Never write to `world[x][z]` directly outside of init — go through `setCell`,
or you will desync intent from rendering.

## Adding a new object kind

1. Add a factory: `function makeWidget(...)` returning a `THREE.Group`.
2. Add a tool entry to `TOOLS` (id, label, kind, color, optional
   `terrainOverride`).
3. Handle the `kind` in `renderCellObject` — call your factory, set
   `userData.kind`, push a drop-in animation if appropriate.
4. If the kind needs adjacency awareness, write a `getXxxNeighbors(x, z)`
   helper and re-render neighbors inside `setCell` (mirror the fence/house
   pattern at the bottom of `setCell`).
5. If the kind animates per-frame, add a branch inside the `for (const key in
   cellMeshes)` loop in `animate()` and **respect `obj.userData.landing`** so
   it doesn't fight the drop-in.

## Adding a new terrain

1. Add a material to `M`.
2. Add a tool entry with `terrain: 'name'`.
3. Handle the name inside `makeTile(terrain)` — pick `topMat` and any decals
   (flecks, scuffs, ripples).

## Three.js gotchas in this codebase

- **r128** is pinned. `MeshLambertMaterial`, `ExtrudeGeometry`, and the
  shadow setup all assume r128 semantics. Do not bump the version casually —
  shadows and material color spaces have changed in newer releases.
- Materials in `M.*` are **shared** across many meshes. Don't mutate
  `M.foo.color` in place; clone first.
- `disposeGroup(group)` disposes geometries but **not** materials, because
  materials are shared. Per-particle smoke clones its material and disposes
  on death — follow that pattern if you ever need a unique material per
  instance.
- Cameras: `orthoCam`, `softCam`, and `persCam` exist; `camera` is a reference
  swapped by `togglePerspective()` / `setCameraMode()`. `updateCamera()` writes
  to all camera projections/positions as needed.

## Performance budget

- Home grid starts at `8x8` but settings can expose up to `48x48`. Per-frame
  allocation is fine at small sizes; at larger grids, preserve progressive
  rendering and avoid broad synchronous rebuilds.

## Things to avoid

- Don't pull in npm packages or a bundler. The single-file constraint is the
  point.
- Don't rename `world` / `cellMeshes` / `setCell` — they're the public
  contract of the data layer.
- Don't remove the `userData.landing` checks. They prevent animations from
  fighting the drop-in queue.
- Don't "clean up" comments without asking.
- Don't touch `tiny-world-builder BACKUP.html` if that local snapshot exists.

## Quick checks before declaring done

- [ ] `npm test` passes.
- [ ] Page loads with no console errors.
- [ ] Tool keyboard shortcuts (`1`–`9`, `E`) still work.
- [ ] `R` / `F` raise and lower the hovered terrain; reset button restores the
      preset village; `C` clears to grass with the staggered drop-in.
- [ ] Perspective ⇄ ortho still toggles cleanly.
- [ ] Placing/erasing a fence updates its neighbors' geometry.
- [ ] Clusters of houses still render as L/T/+/square where appropriate.
- [ ] Smoke spawns from house chimneys after they finish landing.

## Ether Wars State Storage and Commit-Reveal Architecture

### Overview

Ether Wars uses separate storage systems for public finalized game state, private pending reveal data, and authoritative on-chain state.

The frontend must not treat AWS public state as the source of authority for commitments, reveals, ownership, or settlement. The blockchain remains authoritative. AWS contains indexed public state optimized for frontend reads.

```text
PLAYER DEVICE
├── editable local workspace
├── pending action
├── reveal salt
├── commitment hash
├── EIP-712 reveal authorization
└── confirmed commitment metadata

PRIVATE BACKEND
├── encrypted reveal packages
├── commitment verification
├── reveal scheduling
├── batch reveal submission
└── reveal transaction tracking

BLOCKCHAIN
├── commitment hash
├── reveal authorization verification
├── revealed action
├── settlement
└── authoritative tournament state

INDEXER
├── reads finalized contract events and state
├── derives frontend-friendly public state
└── writes public state to AWS

AWS PUBLIC DATA
└── frontend-readable finalized state
```

### Public AWS File Structure

Public tournament state is stored using the following structure:

```text
tournaments/
└── {tournamentId}/
    ├── tournament.json
    ├── tables/
    │   └── {tableId}.json
    └── landlords/
        └── {playerId}/
            └── public.json
```

The frontend should access these files through a centralized data-access layer. Raw AWS paths and direct `fetch()` calls should not be scattered throughout rendering code.

### `tournament.json`

`tournament.json` contains tournament-wide public state.

Typical fields include:

```text
schemaVersion
chainId
contractAddress
tournamentId
currentRoundId
currentPhase
commitStartTime
commitEndTime
revealStartTime
revealEndTime
tournamentStatus
entrantCount
maximumEntrants
entryCost
lastFinalizedBlock
lastIndexedTransaction
stateVersion
updatedAt
```

The exact schema may evolve. Consumers must validate `schemaVersion` before using the record.

### `tables/{tableId}.json`

A table record contains public player grouping and neighbor information for one tournament table.

Typical fields include:

```text
schemaVersion
tournamentId
roundId
tableId
playerIds
neighborAssignments
slotAssignments
tableStatus
lastFinalizedBlock
stateVersion
updatedAt
```

Neighbor and slot assignments must be deterministic.

The frontend must not assign visual slots based on:

* HTTP response order
* Promise completion order
* JavaScript object iteration order
* Nondeterministic local state

Prefer explicit slot assignments from the table record. If the table record does not contain slots, sort actual neighbor player IDs numerically and assign them using a fixed slot order.

The frontend must render only actual assigned neighbors. It must not create placeholder neighbors for unused slots.

### `landlords/{playerId}/public.json`

A landlord public record contains frontend-readable public state for one player.

Typical fields include:

```text
schemaVersion
chainId
contractAddress
tournamentId
roundId
tableId
playerId
walletAddress
neighborPlayerIds
credits
food
water
oxygen
shelter
fleet
population
buildingLevels
eliminated
hasCommitted
hasRevealed
lastFinalizedAction
lastFinalizedBlock
stateVersion
updatedAt
```

Every landlord public land file is expected to include `contractAddress`. It
identifies the Ethereum contract associated with that published land state.
Mock/indexer fixtures may temporarily contain an abbreviated placeholder, but
production indexed records should contain the complete Ethereum address. The
frontend may display this public value, but must not treat it as proof of
ownership or authority without validating it against the active tournament and
chain context.

The public record must only contain information that is safe to reveal at its current stage of the round.

### Information Prohibited from Public AWS State

The following values must never be written to `tournament.json`, table records, landlord public records, frontend logs, analytics payloads, public object metadata, URLs, or public object names:

```text
Pending action payload
Reveal salt
Plaintext unrevealed move
EIP-712 reveal signature
Pending reveal authorization
Private reveal-package identifier
Private encryption metadata
Backend credentials
KMS plaintext data keys
```

### Private Reveal Store

Automatic reveal requires the backend to receive the complete reveal package during the Commit phase.

Private reveal packages are stored separately from public AWS state.

Conceptual structure:

```text
PRIVATE REVEAL STORE
└── reveal-packages/
    └── {chainId}/
        └── {contractAddress}/
            └── {tournamentId}/
                └── {roundId}/
                    └── {playerAddress}.encrypted
```

This store must not be frontend-readable.

Private reveal data should be protected using:

```text
Backend-only IAM access
No public access
TLS in transit
Encryption at rest
AWS KMS envelope encryption
Restricted object-prefix permissions
Short post-reveal retention
Audit logging for reads and writes
No request-body logging
```

### Commit Phase Flow

During the Commit phase, the player device:

```text
1. Builds the exact action payload.
2. Generates a cryptographically secure random salt.
3. Calculates the commitment hash using the contract's exact encoding.
4. Builds an EIP-712 RevealAuthorization.
5. Signs the RevealAuthorization.
6. Uploads the full reveal package to the private backend.
7. Waits for a durable-storage receipt.
8. Submits the commitment hash on-chain.
9. Provides the commit transaction hash or allows the backend to detect it.
```

The preferred ordering is store first, then commit.

This avoids the unrecoverable case where the commitment succeeds on-chain but the browser closes before the reveal package reaches the backend.

The consequence is that the backend learns the pending move during the Commit phase. This is an accepted trust assumption of the automatic-reveal design.

### Reveal Authorization

The player should sign EIP-712 typed data.

A conceptual authorization structure is:

```solidity
struct RevealAuthorization {
    address player;
    uint256 tournamentId;
    uint256 roundId;
    bytes32 commitmentHash;
    address relayer;
    uint256 nonce;
    uint256 deadline;
}
```

The signature must be bound to:

```text
Player wallet
Chain ID
Verifying contract
Tournament ID
Round ID
Commitment hash
Authorized relayer
Unique nonce
Expiration deadline
```

Do not authorize a reveal by signing only the action or only the commitment hash.

Contract-side signature verification should support both externally owned accounts and ERC-1271 smart-contract wallets. OpenZeppelin `SignatureChecker` is the preferred compatibility layer unless the contract architecture requires another implementation.

### Reveal Phase Flow

During the Reveal phase, the backend:

```text
1. Loads pending reveal packages for the tournament and round.
2. Confirms the player's commitment exists on-chain.
3. Recalculates the commitment hash from the stored action and salt.
4. Confirms the calculated hash matches the on-chain commitment.
5. Verifies the EIP-712 authorization.
6. Checks chain, contract, tournament, round, player, relayer, nonce, and deadline.
7. Rejects duplicate, expired, mismatched, or already-consumed authorizations.
8. Submits valid reveals through revealFor or batchRevealFor.
9. Waits for transaction confirmation.
10. Marks a package revealed only after confirmation.
```

The backend must not mark a package successfully revealed merely because a transaction was submitted.

### Contract Reveal Interface

The contract must allow an authorized relayer to reveal for a player.

Conceptually:

```solidity
function revealFor(
    address player,
    Action calldata action,
    bytes32 salt,
    RevealAuthorization calldata authorization,
    bytes calldata signature
) external;
```

The contract must:

```text
Rebuild the commitment hash
Match it against the stored player commitment
Verify the typed-data signature
Verify the player
Verify chain and contract domain separation
Verify tournament and round
Verify the relayer
Verify the nonce
Verify the deadline
Consume the nonce or authorization
Reject duplicate reveals
Mark the player revealed
Avoid treating msg.sender as the player
```

Batch reveal may use:

```solidity
function batchRevealFor(
    RevealRequest[] calldata requests
) external;
```

The implementation must explicitly decide whether one invalid reveal reverts the complete batch or whether each reveal is processed independently.

Independent processing is operationally safer but requires:

```text
Per-item validation
Per-item success or failure events
Careful gas limits
Protection against excessive batch sizes
Clear retry behavior
```

### Public Frontend Load Flow

The frontend should load public state in this order:

```text
1. Determine the active tournamentId.
2. Fetch tournaments/{tournamentId}/tournament.json.
3. Determine the connected playerId.
4. Fetch tournaments/{tournamentId}/landlords/{playerId}/public.json.
5. Read the player's tableId and neighborPlayerIds.
6. Fetch tournaments/{tournamentId}/tables/{tableId}.json.
7. Validate player and neighbor assignments across the records.
8. Fetch public.json for each actual neighbor.
9. Normalize raw AWS records into internal frontend state.
10. Render the player and only the actual neighbors.
```

The rendering layer should not need to know the AWS directory structure.

### Frontend Layer Separation

Use a separation similar to:

```text
Transport layer
    Builds AWS paths and fetches JSON.

Validation layer
    Verifies required fields, identifiers, versions, and relationships.

Normalization layer
    Converts AWS schemas into frontend state objects.

State layer
    Stores tournament, table, player, and neighbor state.

Rendering layer
    Renders normalized state.
```

Do not allow UI components to directly mutate raw AWS records.

### Cross-File Validation

Before accepting loaded public state, validate at minimum:

```text
Supported schema version
Matching chain ID
Matching contract address
Matching tournament ID
Compatible round ID
Matching player ID
Matching table ID
Player exists in the table
Neighbor IDs agree with the table assignment
No duplicate player IDs
No duplicate slot assignments
State is not older than the currently loaded version
```

The frontend should prefer the newest state using a monotonic field such as:

```text
lastFinalizedBlock
stateVersion
```

Do not rely only on client timestamps to determine which response is newer.

### Partial Failure Behavior

A missing tournament record is fatal for loading that tournament.

A missing current-player record is fatal for loading the player's game view.

A missing table record prevents reliable neighbor assignment and should produce a visible loading error.

A missing individual neighbor record should not necessarily prevent the current player's own board from loading. The UI may show that specific assigned neighbor as temporarily unavailable, but it must not substitute mock data or a different player.

### Public State Updates

Public AWS state should be written by the indexer only after the relevant blockchain state is sufficiently finalized according to the application's finality policy.

The expected direction of data flow is:

```text
Blockchain
    ↓
Indexer
    ↓
AWS public state
    ↓
Frontend
```

The frontend must not write authoritative tournament state back to the public state bucket.

### Trust Boundary

This automatic-reveal design is not trust-minimized.

The backend can technically inspect pending player actions because it holds the plaintext action and salt before Reveal.

Security controls reduce operational risk but do not remove this trust assumption.

The design must therefore treat the private reveal service as a high-trust component and isolate it from:

```text
Public S3 access
Frontend credentials
Public APIs that return stored packages
Analytics systems
General application logs
Unnecessary employee access
```

### Implementation Rule for Agents

When modifying this system:

```text
Do not place private reveal data in public AWS schemas.
Do not make public state authoritative over the blockchain.
Do not introduce direct AWS fetches throughout UI components.
Do not create fake neighbors when public records are unavailable.
Do not base neighbor placement on asynchronous fetch order.
Do not log actions, salts, or signatures.
Do not change commitment encoding without updating every producer,
verifier, test vector, backend validator, and contract implementation.
```

Any change to the commitment payload or EIP-712 authorization must be treated as a cross-system protocol change affecting:

```text
Solidity contracts
Frontend commitment generation
Frontend typed-data signing
Backend package validation
Backend reveal submission
Indexer interpretation
Tests and fixtures
Documentation
```
