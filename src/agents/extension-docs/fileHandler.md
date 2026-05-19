# learn_fileHandler — File handler contribution

A file handler registers your extension as a viewer or editor for files matching
a set of extensions. Canv routes file-opens to the handler and shows it in place
of the default text editor.

## Manifest shape

```json
{
  "type": "fileHandler",
  "extensions": [".pdf", ".epub"],
  "entry": "handler/viewer.html",
  "mode": "viewer"
}
```

## Field semantics

| Field | Required | Notes |
|---|---|---|
| `type` | YES | Always `"fileHandler"` |
| `extensions` | YES | Array of dot-prefixed lowercase extensions: `[".pdf"]`. |
| `entry` | YES | Relative path to the HTML file. Must be a key in `files`. |
| `mode` | YES | `"viewer"` — read-only; `"editor"` — can write bytes back. |

**Mode guide:**
- `"viewer"` — use for formats where users just want to see content (PDF, images, diagrams).
- `"editor"` — use when the extension modifies and saves the file. Requires `activeDoc.write` capability and enables `canv.activeDoc.setBytes`.

## API methods for file handlers

File handlers use a dedicated byte-level API. The handler iframe receives the active file automatically.

```js
// Read file bytes — requires activeDoc.read
const bytes = await canv.activeDoc.getBytes()  // → Uint8Array

// Write file bytes — requires activeDoc.write (mode: 'editor' only)
await canv.activeDoc.setBytes(uint8Array)       // saves and marks doc clean

// Get the file path
const path = await canv.activeDoc.getPath()     // absolute path string or null

// React to the user switching files — requires events.docChanged
const unsub = canv.events.on('activeFile.changed', async () => {
  const bytes = await canv.activeDoc.getBytes()
  render(bytes)
})
canv.lifecycle.onUnload(() => unsub())
```

## Routing rules

- Canv matches by file extension (case-insensitive).
- If multiple extensions claim the same file type, the last-installed wins — warn users in your description.
- The user can override routing per-workspace via `.canv/extensions/file-handlers.json`:
  ```json
  { ".pdf": "my-pdf-viewer" }
  ```
  where the value is the extension `id`.
- The "Open with…" right-click menu in the file tree lists all handlers registered for that extension.
  The user's choice is stored in the workspace defaults file above.

## What you can and can NOT render inside a fileHandler

A fileHandler renders inside an Electron `WebContentsView` with a strict per-extension CSP and the `canv-extension://` custom scheme. This limits what you can show:

| Format | Renderable today? | How |
|---|---|---|
| Text (`.tex`, `.csv`, `.log`, …) | ✅ Yes | Decode `getBytes()` as UTF-8 and render in a `<pre>`. |
| Binary metadata views (size, hex preview, EXIF, …) | ✅ Yes | Decode `getBytes()` and show what you parsed. |
| Images (`.png`, `.jpg`, `.gif`) | ✅ Yes | `<img>` from a blob URL — CSP allows `img-src ... blob:`. |
| PDF rendering | ❌ Not without a bundled JS library | Chromium blocks `<iframe src="blob:canv-extension://...">` (treated as a non-web resource). The `pdfjs` package is not bundled with Canv. The honest pattern is to show metadata + a "Open externally" button. |
| Video / audio | ⚠ Limited | `media-src 'self'` does not yet allow `blob:`. Stream from the host via a future API. |

If you want full PDF rendering, ship the JS library inside the extension as a file (`pdfjs.js`) and reference it via a relative `<script src="./pdfjs.js">`. Do NOT use a CDN — `net` would cover the fetch but inline + cross-origin scripts hit other CSP rules.

## Minimal complete example — PDF metadata viewer

```json
{
  "manifest": {
    "id": "pdf-viewer",
    "name": "PDF Viewer",
    "version": "1.0.0",
    "description": "Opens .pdf files and shows their file metadata (size, first-page magic header).",
    "capabilities": [],
    "contributions": [{
      "type": "fileHandler",
      "id": "main",
      "extensions": [".pdf"],
      "entry": "handler/viewer.html",
      "mode": "viewer"
    }]
  },
  "files": {
    "handler/viewer.html": "<!doctype html><html><head><meta charset='utf-8'><style>body{margin:0;padding:var(--canv-space-4);background:var(--canv-color-panel);color:var(--canv-text);font-family:var(--canv-font-sans);font-size:var(--canv-font-size-sm)}h1{margin:0 0 var(--canv-space-3);font-size:var(--canv-font-size-lg);font-weight:600}dl{display:grid;grid-template-columns:auto 1fr;gap:var(--canv-space-2) var(--canv-space-3);margin:0}dt{color:var(--canv-text-muted)}</style></head><body><h1 id='title'>PDF</h1><dl><dt>Size</dt><dd id='size'>—</dd><dt>Magic</dt><dd id='magic'>—</dd></dl><script src='./viewer.js'></script></body></html>",
    "handler/viewer.js":   "function basename(p){if(!p)return'';const parts=String(p).split(/[\\\\/]/);return parts[parts.length-1]||''}function fmt(n){if(n<1024)return n+' B';if(n<1048576)return Math.round(n/1024)+' KB';return (n/1048576).toFixed(1)+' MB'}async function render(){try{const path=await canv.activeDoc.getPath();const bytes=await canv.activeDoc.getBytes();const buf=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);document.getElementById('title').textContent=basename(path)||'PDF';document.getElementById('size').textContent=fmt(buf.byteLength);const magic=Array.from(buf.slice(0,4)).map(b=>String.fromCharCode(b)).join('');document.getElementById('magic').textContent=magic+' ('+(magic==='%PDF'?'valid':'unrecognised')+')'}catch(err){document.getElementById('size').textContent='Error: '+(err&&err.message||err)}}render();canv.events.on('activeFile.changed',render)"
  }
}
```

**Note:** the script lives in a separate `handler/viewer.js` file. Inline `<script>...</script>` is CSP-blocked.

## Pitfalls

- **Trying to iframe a `blob:` PDF**: blocked by Chromium's local-resource check on custom-protocol pages. Don't generate `<iframe src='blob:...'>` patterns.
- **CDN scripts**: external scripts are CSP-blocked. Bundle the library as a file in your extension and reference it locally.
- **Inline `<script>` or `onclick="..."`**: blocked by the per-extension CSP. Always use external `.js` files + `addEventListener`.
- **`mode: "viewer"` calling `setBytes`**: the runtime will reject the call; switch to `"editor"`.
- **Not handling `activeFile.changed`**: the panel stays showing the previous file when the user clicks another file in the tree.
- **Large files**: `getBytes()` returns the whole file at once — stream or paginate heavy formats yourself.
- **Extension conflicts**: if another installed extension also claims `.pdf`, warn in your `description`.
- **`setBytes` without `mode: "editor"`**: the host rejects the call; either switch to editor mode or drop the setBytes call.
- **Forgetting `contributions[].id`**: every contribution requires a unique `id` string.
