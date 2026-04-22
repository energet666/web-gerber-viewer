# Agent Context

## Project

This is a static, browser-only Gerber viewer built with Vite, React, and TypeScript.
It has no backend. Files are read locally in the browser with the File API and rendered
with `gerber-to-svg`.

## Commands

- `npm install` installs dependencies.
- `npm test` runs Vitest unit tests.
- `npm run build` runs TypeScript checks and creates the production build in `dist/`.
- `npm run dev -- --port 5173` starts the local Vite server.

## Important Files

- `src/main.tsx` contains the React app, upload flow, viewer UI, SVG composition, and export.
- `src/domain/layers.ts` contains layer inference, viewBox helpers, SVG extraction helpers, and shared types.
- `src/domain/renderGerber.ts` reads files and converts Gerber/Excellon text to SVG.
- `src/domain/layers.test.ts` covers layer detection and SVG/viewBox helpers.
- `src/types/gerber-to-svg.d.ts` provides the local declaration for `gerber-to-svg`.

## Rendering Notes

`gerber-to-svg` emits each layer as a standalone SVG with its own `viewBox` and a
per-layer `transform="translate(...) scale(1,-1)"`. Do not compose layers by directly
nesting each full inner SVG into one parent SVG, because layers with different bboxes
will shift relative to each other.

The current implementation extracts each layer's `defs` and raw geometry, then applies
one shared Gerber Y-axis transform based on the combined viewBox. Preserve that behavior
unless replacing the renderer with a different coordinate normalization strategy.

## Git Hygiene

The repository intentionally ignores:

- `node_modules/`
- `dist/`
- `.codex`

Commit source files, config, tests, and `package-lock.json`. Do not commit generated
build output or installed dependencies.

## Memory Notes

Use `MEMORY.md` for durable project notes that should survive across agent sessions:
important decisions, non-obvious bugs, constraints, and gotchas. Keep entries short,
factual, and relevant to future work.
