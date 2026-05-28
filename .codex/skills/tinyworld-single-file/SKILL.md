---
name: tinyworld-single-file
description: Use when editing the Tiny World Builder repo, especially tiny-world-builder.html, to preserve the single-file Three.js r128 app structure and local edit/reload workflow.
---

# Tiny World Single-File Workflow

Work mainly in `tiny-world-builder.html`; also update `vendor/three/`, `publish.sh`, checks, docs, or skills when a change affects those durable contracts.

Core rules:

- Keep the app single-file at runtime: inline CSS, inline JS, no bundler, no npm runtime packages.
- Do not touch `tiny-world-builder BACKUP.html` if present.
- Preserve style: 2-space indent, semicolons, single-quoted strings, section comments like `// -------- tools --------`.
- Mutate board state through `setCell(x, z, opts)`, not direct `world[x][z]` writes outside initialization.
- The startup home board default is derived from the mock `landsConquered`
  stat via `gridSizeForLandsConquered()`. Keep camera framing tied to
  `HOME_GRID_VIEW_BASE`, not the dynamic default.
- Keep Three.js pinned to r128 and self-hosted under `vendor/three/`; do not reintroduce CDN runtime scripts.
- Cluso is local feedback tooling only: it may be dynamically loaded on localhost/file URLs, but production `dist/` must not include `dist/cluso/` or static Cluso `<script>/<link>` tags.
- Shared materials in `M.*` must not be mutated per instance; clone first for unique opacity/material behavior and dispose cloned materials in `disposeGroup`.

Validation:

- Run `npm test` (syntax-checks the inline app script, parses `world.schema.json`, verifies embedded schema parity, checks local script/link assets, and runs the no-browser smoke guard).
- For targeted parser checks, run `perl -0ne 'print $1 if m#<script>\s*(.*?)\s*</script>#s' tiny-world-builder.html | node --check`.
- Prefer browser validation at `http://localhost:3000/tiny-world-builder`.
- Check console errors after visual/UI changes.
