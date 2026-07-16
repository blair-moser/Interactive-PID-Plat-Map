# Interactive PID Plat Map

Interactive Vite/React map for placing PID project dots on a plat image, editing project details, and sharing a client-facing map view.

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## GitHub Pages

The app is configured for GitHub Pages at `/Interactive-PID-Plat-Map/` through `vite.config.ts`, and `.github/workflows/deploy.yml` builds and deploys `dist` on pushes to `main`.

Put public map/detail images in `public/`. In the editor, use image names such as `pid-no-1-map.png` or `H-GIP-1-GS1.png`; full `https://` image URLs also work.

## Dot Data

The durable project dots live in `public/dots.json`. The app loads that file when a browser does not already have a local working copy.

Editing in the browser still autosaves a working copy locally so changes survive reloads. To make those changes permanent in GitHub:

1. Click **Export dots.json** in the app.
2. Replace `public/dots.json` with the exported file.
3. Run `npm run build`.
4. Commit and push the updated `public/dots.json`.

The exported `dots.json` file can also be imported back into the app with **Import dots**.
