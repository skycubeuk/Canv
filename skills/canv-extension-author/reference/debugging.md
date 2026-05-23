# Debugging Extensions

## Opening the extension's DevTools

Right-click anywhere **inside the extension's rendered panel** and choose **"Inspect Extension"**. This opens a Chromium DevTools window scoped to that WebContentsView — it is isolated from the main Canv DevTools window. Console errors, network failures, and CSP violations from the extension all appear here.

Do not use the main Canv DevTools window (opened via Ctrl+Shift+I in the host). It shows the host renderer's errors, not the extension panel's.

## Where different errors surface

| Error type | Where it appears |
|---|---|
| Manifest validation errors | Canv's Extensions tab / install consent modal at install time |
| CSP violations | Extension DevTools console at runtime |
| `canv.*` capability errors | Extension DevTools console at runtime |
| Missing files (404) | Extension DevTools console (`Failed to load resource`) |
| Unhandled JS exceptions | Extension DevTools console at runtime |

Manifest errors are schema-level: wrong `location`, missing `capabilities`, malformed `panels` array, etc. Fix these in `manifest.json` and reinstall. Runtime errors happen after the extension is loaded into a panel.

## Common errors and fixes

**`CapabilityError: extension "X" lacks required capability "activeDoc.read"`**
Add the capability to `manifest.capabilities`. Every `canv.*` API call has a corresponding capability string; the error message names it.

**`Refused to execute inline script`**
A `<script>...</script>` block is inside the HTML. The CSP forbids inline scripts. Move all JavaScript into an external `.js` file and reference it with `<script src="./my-script.js">`.

**`Refused to apply inline event handler`**
An `onclick="..."` or similar attribute is in the HTML. Replace it with `addEventListener` called from the external JS file.

**`Refused to load the script 'https://cdn.jsdelivr.net/...'`** (or any HTTPS script URL)
The CSP's `script-src` does not include external HTTPS origins. Download the library, place it in `vendor/`, and load it as `<script src="../vendor/library.js">` (path relative to the HTML file).

**`Refused to frame 'blob:canv-extension://...'`**
Chromium blocks blob URLs from custom-protocol pages as local resources. You cannot put a blob URL in an `<iframe src>`. Render the content to a `<canvas>` or an `<img src="blob:...">` element instead.

**`Failed to load resource: net::ERR_FILE_NOT_FOUND` on a `vendor/foo.js` or `handler/viewer.js`**
Path mismatch. `<script src>` resolves relative to the HTML file's own URL, not the extension root. Check the full URL shown in the error message, then adjust the `src` attribute. Climbing a directory: use `../vendor/foo.js`.

**`"no active file for this extension"` from `getBytes()`**
The fileHandler panel called `getBytes()` before the `showFileInExtension` IPC stored an active file — usually a React strict-mode double-invoke race. The runtime tolerates a retry. If it persists: confirm the extension is being routed via the `fileHandler` path. Panel contributions (`panels` array) do not receive an active file; `getBytes()` only makes sense inside a `fileHandler` panel.

## Reloading after editing files

Changes to files in the extension's installed directory do **not** auto-apply. To pick up edits:

- **Extensions tab** → click the ⟳ refresh icon on the extension's row, OR
- Uninstall the extension, then reinstall via **"Install from folder…"**

`Ctrl+R` in the Canv window (Electron host reload) does **not** reload the WebContentsView contents. The panel keeps its previous files until you use one of the two flows above.

## Network requests in DevTools

The DevTools Network panel does not show `canv-extension://` requests the way it shows HTTPS traffic. However, `Failed to load resource: ...` messages **do** appear in the Console tab and include the full `canv-extension://` URL — use those to diagnose 404s and path issues.
