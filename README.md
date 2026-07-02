# EtherWars

EtherWars is a browser-based tournament colony battle game. Players build a
small colony, manage resources, commit hidden round actions, reveal them later,
and try to survive eliminations for tournament rewards.

The current app is frontend-only for local play and prototyping. Tournament,
contract, entrant, and reward data are mocked until backend or onchain data is
wired in.

## Run

```bash
npm run dev
```

Open the local URL printed by the dev server:

```text
http://localhost:3000/tiny-world-builder
```

The route and HTML filename are still kept for compatibility while the game is
branded as EtherWars.

## Basic Controls

| Action | Input |
| --- | --- |
| Place a build item | Click a cell |
| Erase | `E`, then click |
| Raise/lower terrain | `R` / `F` over a cell |
| Switch tools | `1`-`9` and toolbar shortcuts |
| Orbit camera | Drag |
| Pan camera | Right-drag or Space + drag |
| Zoom | Scroll wheel |
| Clear board | `C` |
| Toggle camera mode | `P` or `I` |

## Tournament Flow

1. Enter the tournament lobby.
2. Build and allocate colony resources.
3. Commit a hidden action for the round.
4. Reveal the action during the reveal phase.
5. Resolve eliminations and continue toward tournament rewards.

## Development

```bash
npm test
npm run build
```

The app is a static single-file Three.js game with self-hosted runtime assets in
`vendor/three/`. Deployments use `publish.sh` to generate `dist/`.

## Key Files

```text
tiny-world-builder.html   Main EtherWars app entry point
README.md                 Project overview
AGENTS.md                 Agent/development guidance
world.schema.json         World import/export schema
tools/check.js            Static checks
tools/smoke-static.js     Static smoke tests
vendor/three/             Self-hosted Three.js runtime
```
