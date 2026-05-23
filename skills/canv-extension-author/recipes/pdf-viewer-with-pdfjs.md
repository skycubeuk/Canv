# Recipe: pdf-viewer-with-pdfjs

A fileHandler extension that renders PDFs in Canv using pdfjs-dist, with page navigation and zoom.

## What it does

Takes ownership of `.pdf` files in Canv's editor area. Renders each page to a `<canvas>` element, stacks pages vertically, and re-renders when the active file changes. Documents the exact worker and CSP setup that makes pdfjs-dist work inside a custom-protocol iframe.

## Files

```
pdf-viewer/
  manifest.json           # fileHandler contribution for .pdf
  handler/viewer.html     # full-page viewer; loads viewer.js
  handler/viewer.js       # pdfjs init, page render loop, nav/zoom controls
  vendor/pdfjs-dist.js    # pdfjs main bundle (generated)
  vendor/pdfjs-worker.js  # pdfjs worker bundle (generated)
```

## Setup steps

```bash
mkdir -p pdf-viewer/{handler,vendor}
cd pdf-viewer

npm init -y
npm install pdfjs-dist@4

# Bundle the main pdfjs library.
npx esbuild \
  --bundle \
  --format=esm \
  --platform=browser \
  --outfile=vendor/pdfjs-dist.js \
  node_modules/pdfjs-dist/build/pdf.mjs

# Bundle the worker separately — pdfjs loads it as a distinct script.
npx esbuild \
  --bundle \
  --format=esm \
  --platform=browser \
  --outfile=vendor/pdfjs-worker.js \
  node_modules/pdfjs-dist/build/pdf.worker.mjs

# Write handler/viewer.html and handler/viewer.js (shown below), then:
# Canv → Extensions tab → Install from folder → select pdf-viewer/
```

## Manifest

`pdf-viewer/manifest.json`

```json
{
  "id": "pdf-viewer",
  "name": "PDF Viewer",
  "version": "0.1.0",
  "description": "Renders PDF files using pdfjs-dist.",
  "capabilities": ["activeDoc.read", "events.docChanged"],
  "contributions": {
    "fileHandlers": [
      {
        "id": "pdf-viewer.handler",
        "extensions": [".pdf"],
        "mode": "viewer",
        "handler": "handler/viewer.html"
      }
    ]
  }
}
```

## Viewer HTML

`pdf-viewer/handler/viewer.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: var(--canv-editor-background, #1e1e1e);
      color: var(--canv-foreground, #ccc);
      font-family: var(--canv-font-sans, sans-serif);
    }

    #toolbar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.75rem;
      background: var(--canv-panel-background, #252526);
      border-bottom: 1px solid var(--canv-border, #3c3c3c);
      flex-shrink: 0;
      font-size: 0.8rem;
    }
    #toolbar button {
      background: none;
      border: 1px solid var(--canv-border, #3c3c3c);
      color: inherit;
      padding: 0.2rem 0.5rem;
      border-radius: 3px;
      cursor: pointer;
    }
    #toolbar button:hover { background: var(--canv-button-hover, #2a2d2e); }
    #page-info { min-width: 6rem; text-align: center; }

    #scroll-container {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
    }
    canvas {
      display: block;
      box-shadow: 0 2px 8px rgba(0,0,0,0.5);
    }
    #message {
      margin-top: 4rem;
      color: var(--canv-foreground-muted, #999);
      font-style: italic;
    }
  </style>
</head>
<body>
  <div id="toolbar">
    <button id="btn-prev">&#8592; Prev</button>
    <span id="page-info">— / —</span>
    <button id="btn-next">Next &#8594;</button>
    <span style="flex:1"></span>
    <button id="btn-zoom-out">&#8722;</button>
    <button id="btn-zoom-in">&#43;</button>
    <span id="zoom-label">100%</span>
  </div>
  <div id="scroll-container">
    <div id="message">Loading…</div>
  </div>
  <script type="module" src="viewer.js"></script>
</body>
</html>
```

## Viewer JS

`pdf-viewer/handler/viewer.js`

```js
// CRITICAL: set workerSrc before any pdfjs call.
import * as pdfjs from '../vendor/pdfjs-dist.js'
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  '../vendor/pdfjs-worker.js',
  import.meta.url
).href

const container = document.getElementById('scroll-container')
const message   = document.getElementById('message')
const pageInfo  = document.getElementById('page-info')
const zoomLabel = document.getElementById('zoom-label')

let pdfDoc    = null
let scale     = 1.0
let currentPage = 1

// --- Toolbar wiring ---
document.getElementById('btn-prev').onclick = () => goToPage(currentPage - 1)
document.getElementById('btn-next').onclick = () => goToPage(currentPage + 1)
document.getElementById('btn-zoom-in').onclick  = () => setScale(scale + 0.25)
document.getElementById('btn-zoom-out').onclick = () => setScale(scale - 0.25)

function goToPage(n) {
  if (!pdfDoc) return
  currentPage = Math.max(1, Math.min(n, pdfDoc.numPages))
  renderCurrentPage()
}

function setScale(s) {
  scale = Math.max(0.25, Math.min(s, 4.0))
  zoomLabel.textContent = `${Math.round(scale * 100)}%`
  renderAllPages()
}

// --- Rendering ---
async function renderAllPages() {
  if (!pdfDoc) return
  container.innerHTML = ''
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    await renderPage(i)
  }
}

async function renderCurrentPage() {
  container.innerHTML = ''
  await renderPage(currentPage)
  pageInfo.textContent = `${currentPage} / ${pdfDoc.numPages}`
}

async function renderPage(pageNum) {
  const page     = await pdfDoc.getPage(pageNum)
  const viewport = page.getViewport({ scale })
  const canvas   = document.createElement('canvas')
  canvas.width   = viewport.width
  canvas.height  = viewport.height
  container.appendChild(canvas)

  await page.render({
    canvasContext: canvas.getContext('2d'),
    viewport
  }).promise
}

// --- Load a PDF from a Uint8Array ---
async function loadPdf(data) {
  message.textContent = 'Loading…'
  container.innerHTML = ''
  container.appendChild(message)

  try {
    pdfDoc = await pdfjs.getDocument({
      data,
      isEvalSupported: false   // Required: Canv's CSP forbids eval().
    }).promise

    currentPage = 1
    pageInfo.textContent = `1 / ${pdfDoc.numPages}`
    message.remove()
    await renderAllPages()
  } catch (err) {
    message.textContent = `Failed to load PDF: ${err.message}`
  }
}

// --- Canv integration ---
async function openActiveFile() {
  let bytes
  try {
    bytes = await canv.activeDoc.getBytes()   // returns Uint8Array
  } catch (err) {
    message.textContent = 'No PDF open.'
    return
  }
  await loadPdf(bytes)
}

openActiveFile()
canv.events.on('activeFileChanged', openActiveFile)
```

## Known gotchas

- **`workerSrc` must be set before `getDocument`** is called — even before the module-level import resolves in practice. Setting it at the top of the module (before any async call) is sufficient.
- **Bundle the worker separately.** pdfjs loads its worker as an independent script via a `new Worker(workerSrc)` call. If you omit `vendor/pdfjs-worker.js` and rely on the main bundle, pdfjs falls back to a fake worker that runs everything on the main thread — this works but causes noticeable UI jank on large files.
- **No-worker alternative.** If you want a simpler setup that skips the worker bundle, set `workerSrc` to a data URL and pass `useWorkerFetch: false`:
  ```js
  pdfjs.GlobalWorkerOptions.workerSrc = 'data:application/javascript,'
  ```
  This is fine for small PDFs and dev iteration. Do not ship it in production.
- **`isEvalSupported: false` is mandatory.** Canv runs handler iframes under a CSP that blocks `eval`. pdfjs uses eval for certain font rendering paths; this flag disables those paths. Rendering quality is unchanged for most PDFs; heavily scripted/form PDFs may look slightly different.
- **No `<iframe>` or blob URLs.** Chromium blocks blob-URL iframes loaded from a custom protocol (`canv://`). Render directly to `<canvas>` — which is what this recipe does.
- **`getBytes()` vs `getText()`.** PDFs are binary; use `canv.activeDoc.getBytes()` which returns a `Uint8Array`. `getText()` would corrupt the data by re-encoding through UTF-8.
- **pdfjs-dist@4.x** changed the ESM entry point from `build/pdf.js` to `build/pdf.mjs`. If esbuild complains about the entry point, check `node_modules/pdfjs-dist/package.json` → `"exports"."."."import"`.
