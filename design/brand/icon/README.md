# Lighthouse icon

Source for BidBeacon's app icon: a cel-shaded three.js lighthouse on a rounded indigo-night tile.
`scene.html` builds the scene; `render-icon.ts` renders it in headless Chromium and writes the raster
outputs. `icon-master-512.png` is the committed 512px master, kept as a reference.

Palette: tile `#16133a`; tower bands white (`#ffffff` / `#e9e9f0` / `#b4b4c8`) and indigo
(`#818cf8` / `#6366f1` / `#4338ca`); cap and railing deeper indigo (`#6366f1` / `#4f46e5` / `#312e81`);
lamp `#fcd34d`; beam amber `#f59e0b` outer with `#fcd34d` core; ink outline `#0a0a14`. Each part
gets three hard cel steps (highlight / lit / shade) plus an inverted-hull ink outline.

## Regenerate

```sh
bun run brand:icon                         # writes src/dashboard/public/{icon.png,favicon.ico}
bun run brand:icon -- --out /tmp/icon      # writes all outputs elsewhere for diffing
```

The script installs this folder's own render tooling (`playwright-core`, `sharp`, pinned in this
folder's `package.json`, not the root dependencies) and resolves `three` from the repo's dependency.
It needs a Playwright Chromium build (`bunx playwright-core install chromium` if none is cached).
Rendering uses SwiftShader, so output is deterministic: the committed script reproduces the shipped
files byte-for-byte.

## Outputs and size rules

- `src/dashboard/public/icon.png`: 128x128 PNG. MCP `serverInfo.icons` points at `/icon.png`
  (see `docs/mcp.md`); keep it at or under 64 KiB. The script fails above that budget.
- `src/dashboard/public/favicon.ico`: 16/32/48 PNG-encoded entries.
- PNG and ICO only. MCP clients refuse SVG icons.

The live dashboard header renders a related animated scene in
`src/dashboard/components/header-lighthouse-scene.ts`; changes to the palette or silhouette should
stay consistent between the two.
