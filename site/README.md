# Canv site

Astro + Starlight project that produces the public site at
`https://skycubeuk.github.io/Canv/`.

- Landing page: handwritten in `src/pages/index.astro`.
- Docs: rendered by Starlight from the repo-root `docs/` folder via a
  custom content loader (`src/loaders/docs-loader.ts`). The
  `regenerate-user-docs` skill writes plain markdown with an H1 and no
  frontmatter; the loader extracts the H1 as the page title.

## Develop locally

```bash
cd site
npm install
npm run dev          # Astro dev server at http://localhost:4321/Canv/
```

Edits to `../docs/**/*.md` hot-reload.

## Build

```bash
npm run build        # outputs to site/dist/
```

The deploy workflow (`.github/workflows/deploy-site.yml`) runs this on
every push to `main` that touches `site/**` or `docs/**`.

## Replace the placeholder screenshots

See `public/screenshots/README.md` for the capture list and conventions.
