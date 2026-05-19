# CSP and the canv-extension:// Protocol

## How the custom protocol works

Canv serves every installed extension's files through a custom Chromium protocol:

```
canv-extension://<extensionId>/<rel-path>
```

`<extensionId>` matches the `id` field in `manifest.json`. Any file inside the extension directory — `vendor/`, `panels/`, `handler/`, etc. — is reachable via this URL. For example, if your extension id is `my-viewer`, then `panels/main.js` is served at `canv-extension://my-viewer/panels/main.js`.

A special read-only origin, `canv-extension://canv-shared/`, hosts two shared assets that Canv auto-injects into every panel HTML file (see Auto-injection below):

| Asset | URL |
|---|---|
| Design-system CSS | `canv-extension://canv-shared/canv-ui.css` |
| Icon web component | `canv-extension://canv-shared/canv-icon.js` |

## Per-extension Content Security Policy

Every HTML page served through `canv-extension://` gets the following CSP header applied by the protocol handler:

```
default-src 'self';
script-src 'self' canv-extension://canv-shared;
style-src 'self' 'unsafe-inline' canv-extension://canv-shared;
img-src 'self' data: blob: canv-extension://canv-shared;
font-src 'self' data: canv-extension://canv-shared;
media-src 'self';
connect-src 'self' canv-extension://canv-shared <network-declared-origins>;
object-src 'none';
frame-ancestors 'none';
base-uri 'none';
form-action 'none';
```

`<network-declared-origins>` expands to the hosts listed in `manifest.network` (e.g. `https://api.example.com`). If `manifest.network` is absent or empty, `connect-src` contains only `'self'` and `canv-extension://canv-shared`.

## What is allowed and what is blocked

| | Pattern | Reason |
|---|---|---|
| ✅ | External `.js` files inside the extension (`./vendor/foo.js`, `./panels/main.js`) | `script-src 'self'` covers the extension's own origin |
| ✅ | Inline `<style>...</style>` blocks | `style-src` includes `'unsafe-inline'` |
| ✅ | `<img src="data:...">` and `<img src="blob:...">` | `img-src` includes `data:` and `blob:` |
| ✅ | `fetch()` to hosts declared in `manifest.network` | Those origins are added to `connect-src` at install time |
| ❌ | Inline `<script>...</script>` blocks | `script-src` has no `'unsafe-inline'` |
| ❌ | Inline event handlers (`onclick="..."`, `onload="..."`) | Same — counts as inline script execution |
| ❌ | `eval(...)`, `new Function(...)`, dynamic code evaluation | No `'unsafe-eval'` in `script-src` |
| ❌ | CDN scripts (`<script src="https://cdn.jsdelivr.net/...">`) | External HTTPS origins are not in `script-src` |
| ❌ | `<iframe src="blob:canv-extension://...">` | Chromium blocks blob URLs from custom-protocol pages as "local resources" |
| ❌ | `data:` URLs as script sources | Not permitted; some libraries accept a stub `data:` worker URL as a no-op, which is the only known exception |

Practical implication: **bundle third-party libraries into `vendor/`** and reference them with a relative `<script src>`. Do not link CDN URLs.

## Auto-injection

Canv's protocol handler modifies every served HTML file before it reaches the renderer. It injects into `<head>`:

```html
<link rel="stylesheet" href="canv-extension://canv-shared/canv-ui.css">
<script type="module" src="canv-extension://canv-shared/canv-icon.js"></script>
```

Do **not** add these `<link>` or `<script>` tags yourself — you will get duplicates, and the second load is a wasted request.

## Relative-path resolution

URLs inside a panel HTML file resolve relative to **the HTML file's own URL**, not the extension root.

Example: if your panel file is at `handler/viewer.html`, then:

| `<script src>` value | Resolves to |
|---|---|
| `./viewer.js` | `handler/viewer.js` ✅ (same directory) |
| `viewer.js` | `handler/viewer.js` ✅ (same directory, no dot) |
| `../vendor/pdf.js` | `vendor/pdf.js` ✅ (climb to root, then into vendor/) |
| `/panels/main.js` | Absolute path from protocol root — avoid; use `../panels/main.js` instead |

A 404 for a script almost always means the `src` is being resolved from the wrong base. Check the full URL in the DevTools console `Failed to load resource` message to confirm where the browser is actually looking.
