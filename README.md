# Web Gerber Viewer

Static browser-only Gerber/Excellon viewer built with Vite, React, TypeScript, and `gerber-to-svg`.

The app reads files locally in the browser and does not upload board data to a server.

## Features

- Drag-and-drop or file picker upload for Gerber and drill files.
- Additional uploads append layers instead of replacing the current set.
- Duplicate files with the same name and identical contents are ignored; same-name files with
  different contents are numbered in the layer list.
- Automatic layer type detection from common file names/extensions.
- Manual layer assignment for non-standard file names.
- Layer visibility and color controls.
- Per-layer removal, single-layer viewing, and show/hide-all controls.
- Top and bottom board views.
- Collapsible sidebar.
- Opaque board mode, which shows only the board side facing the viewer.
- Real mask mode, which renders solder mask layers as board-colored fills with mask openings cut out.
- SVG export of the current preview.

## Getting Started

Install dependencies:

```sh
npm install
```

Start the local dev server:

```sh
npm run dev -- --port 5173
```

Open `http://localhost:5173/`.

## Scripts

- `npm run dev -- --port 5173` starts the Vite dev server.
- `npm test` runs Vitest unit tests.
- `npm run build` runs TypeScript checks and writes the production build to `dist/`.
- `npm run preview` serves the production build locally.

## Usage Notes

Load Gerber and Excellon files, then add more files as needed. Use the reset button to clear the
current set. Adjust layer types from the sidebar if the file extensions are non-standard.

The viewer composes each rendered layer into a shared coordinate system. The layer list is shown top-most first, while SVG rendering is still ordered bottom-to-top so visible upper layers are drawn last.

`Real masks` currently ignores the board outline and fills the full current viewBox before cutting out solder mask openings. This is intentional until outline-to-filled-board-shape handling is made reliable.

## Privacy

All rendering happens in the browser. Files are read via the File API and stay on the local machine.
