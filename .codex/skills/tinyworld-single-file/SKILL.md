---
name: tinyworld-single-file
description: Use when editing the Tiny World Builder repo, especially tiny-world-builder.html, to preserve the single-file Three.js r128 app structure and local edit/reload workflow.
---

# EtherWars Single-File Workflow

Work mainly in `tiny-world-builder.html`; also update `vendor/three/`, `publish.sh`, checks, docs, or skills when a change affects those durable contracts.

Use `EtherWars` for game-facing UI, prompt, and documentation language. Keep
legacy filenames, routes, storage keys, globals, and tool/API names until a
dedicated migration adds backward-compatible aliases.

Core rules:

- Keep the app single-file at runtime: inline CSS, inline JS, no bundler, no npm runtime packages.
- Do not touch `tiny-world-builder BACKUP.html` if present.
- Preserve style: 2-space indent, semicolons, single-quoted strings, section comments like `// -------- tools --------`.
- Mutate board state through `setCell(x, z, opts)`, not direct `world[x][z]` writes outside initialization.
- The playable home board is fixed at 20x20. Do not derive `GRID` from
  Lands Conquered, resources, player stats, saved grid-size values, or
  generated world settings. Larger surroundings should come from ghost boards,
  not from resizing the playable area.
- Keep Three.js pinned to r128 and self-hosted under `vendor/three/`; do not reintroduce CDN runtime scripts.
- Cluso is local feedback tooling only: it may be dynamically loaded on localhost/file URLs, but production `dist/` must not include `dist/cluso/` or static Cluso `<script>/<link>` tags.
- Shared materials in `M.*` must not be mutated per instance; clone first for unique opacity/material behavior and dispose cloned materials in `disposeGroup`.
- Persistence is sparse: omitted/default cells must restore through `BASE_TERRAIN`, not hardcoded terrain literals such as `'grass'`, or autosaves can repopulate blank cells with the wrong terrain.

Validation:

- Run `npm test` (syntax-checks the inline app script, parses `world.schema.json`, verifies embedded schema parity, checks local script/link assets, and runs the no-browser smoke guard).
- For targeted parser checks, run `perl -0ne 'print $1 if m#<script>\s*(.*?)\s*</script>#s' tiny-world-builder.html | node --check`.
- Prefer browser validation at `http://localhost:3000/tiny-world-builder`.
- Check console errors after visual/UI changes.
