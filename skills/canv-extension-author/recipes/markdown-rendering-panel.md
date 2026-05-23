# Recipe: markdown-rendering-panel

A sidebar panel that renders the active markdown document as styled HTML using `marked`.

## What it does

Reads the active document text, converts it to HTML with `marked`, and displays it in a scrollable panel. Updates live as the user types. `marked` is bundled locally with esbuild — no CDN, no network required at runtime.

## Files

```
md-preview/
  manifest.json         # panel contribution, activeDoc + docChanged capabilities
  panels/main.html      # panel iframe; loads main.js
  panels/main.js        # reads doc, calls marked(), writes innerHTML
  vendor/marked.js      # marked bundled for the browser (generated — do not edit by hand)
```

## Setup steps

```bash
mkdir -p md-preview/{panels,vendor}
cd md-preview

npm init -y
npm install marked@12

# Bundle marked into a single ESM file the panel can import.
npx esbuild \
  --bundle \
  --format=esm \
  --platform=browser \
  --outfile=vendor/marked.js \
  node_modules/marked/lib/marked.esm.js

# Write the remaining files (shown below), then:
# Canv → Extensions tab → Install from folder → select md-preview/
```

## Manifest

`md-preview/manifest.json`

```json
{
  "id": "md-preview",
  "name": "Markdown Preview",
  "version": "0.1.0",
  "description": "Renders the active markdown file as HTML in a sidebar panel.",
  "capabilities": ["activeDoc.read", "events.docChanged"],
  "contributions": {
    "panels": [
      {
        "id": "md-preview.main",
        "label": "Preview",
        "icon": "codicon-preview",
        "location": "right-sidebar",
        "panel": "panels/main.html"
      }
    ]
  }
}
```

## Panel HTML

`md-preview/panels/main.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      margin: 0;
      padding: 1rem;
      font-family: var(--canv-font-sans, sans-serif);
      font-size: 0.875rem;
      line-height: 1.6;
      color: var(--canv-foreground, #ccc);
      background: var(--canv-panel-background, #1e1e1e);
      overflow-y: auto;
    }
    h1, h2, h3 { margin-top: 1.2em; margin-bottom: 0.4em; }
    code {
      background: var(--canv-code-background, #2d2d2d);
      padding: 0.1em 0.3em;
      border-radius: 3px;
      font-family: var(--canv-font-mono, monospace);
    }
    pre code { background: none; padding: 0; }
    pre {
      background: var(--canv-code-background, #2d2d2d);
      padding: 0.75rem 1rem;
      border-radius: 4px;
      overflow-x: auto;
    }
    blockquote {
      border-left: 3px solid var(--canv-accent, #007acc);
      margin: 0;
      padding-left: 1rem;
      color: var(--canv-foreground-muted, #999);
    }
    #empty {
      color: var(--canv-foreground-muted, #999);
      font-style: italic;
    }
  </style>
</head>
<body>
  <div id="output"><span id="empty">No document open.</span></div>
  <script type="module" src="main.js"></script>
</body>
</html>
```

## Panel JS

`md-preview/panels/main.js`

```js
import { marked } from '../vendor/marked.js'

const output = document.getElementById('output')

async function render() {
  let text = ''
  try {
    text = await canv.activeDoc.getText()
  } catch {
    output.innerHTML = '<span id="empty">No document open.</span>'
    return
  }

  if (!text.trim()) {
    output.innerHTML = '<span id="empty">Empty document.</span>'
    return
  }

  // marked() is synchronous by default; use { async: false } to be explicit.
  output.innerHTML = marked(text, { async: false })
}

render()
canv.events.on('activeDocChanged', render)
canv.events.on('docChanged', render)
```

## Known gotchas

- **`fileHandler` is not used here.** This is a panel that observes the active doc — it does not take ownership of rendering `.md` files in the editor itself. Use a `fileHandler` contribution only when you want Canv to hand off file rendering entirely to your extension.
- **`marked@12` ESM entry point** is `lib/marked.esm.js`. Earlier versions used `src/marked.js`. Check `node_modules/marked/package.json` → `"exports"` if the esbuild command fails.
- **Do not import from `node_modules` at runtime.** The panel iframe has no access to the filesystem. Always bundle with esbuild first and import from `../vendor/`.
- **`marked` output is unsanitised.** If the source document can contain untrusted content, run the output through DOMPurify before setting `innerHTML`. For local personal docs this is typically not a concern.
- **esbuild `--platform=browser`** strips Node built-ins. If marked (or any dependency) tries to `require('fs')`, esbuild will substitute an empty shim. Verify the bundle with `node --input-type=module < vendor/marked.js` if you see runtime errors.
