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
