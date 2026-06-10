# Panel contribution

A panel is a persistent UI pane embedded in Canv's sidebar or dock.
It renders an HTML file in an isolated iframe with access to the `canv.*` API.

## Manifest shape

```json
{
  "type": "panel",
  "id": "main",
  "title": "Word Count",
  "icon": "bar-chart",
  "location": "left-sidebar",
  "entry": "panels/main.html"
}
```

## Field semantics

| Field | Required | Notes |
|---|---|---|
| `type` | YES | Always `"panel"` |
| `id` | YES | **kebab-case**, matches `/^[a-z][a-z0-9-]{0,63}$/` — lowercase letters, digits, hyphens; must start with a letter. Examples: `"main"`, `"word-count"`, `"chapter-outline"`. Rejected: `"Main"` (uppercase), `"wordCount"` (camelCase), `"word_count"` (underscore), `"1-foo"` (leading digit). Unique within this extension; used in activation events. |
| `title` | YES | Shown in the panel tab/header. No emoji. |
| `icon` | no | Icon shown in the sidebar toggle. Must be a valid `<canv-icon>` name. |
| `location` | YES | `"left-sidebar"` or `"bottom-dock"`. **`"right-sidebar"` is INVALID — the runtime rejects it.** |
| `entry` | YES | Relative path to the HTML file. Must be a key in `files`. |

**Location guide:**
- `"left-sidebar"` — vertical tool panels (file-tree style). Use for tools the user keeps open.
- `"bottom-dock"` — horizontal tabbed panels (output/logs style). Use for panels with wide tabular content.

## API methods relevant to panels

All of `canv.*` is available inside the panel iframe. The most commonly used:

```js
// Document access — requires activeDoc.read
const text = await canv.activeDoc.getText()
const path = await canv.activeDoc.getPath()
const sel  = await canv.activeDoc.getSelection()  // { text, start, end }

// Live updates — requires events.docChanged / events.selectionChanged
const unsub = canv.events.on('activeDocChanged', (doc) => { /* refresh */ })
canv.lifecycle.onUnload(() => { unsub() })  // always clean up

// Persistent storage — requires storage
await canv.storage.set('key', value)
const val = await canv.storage.get('key')

// User notifications — requires notify
await canv.ui.notify('Done!', 'info')  // kind: 'info'|'warn'|'error' (default 'info')
```

`canv-ui.css` auto-injects. Use `.canv-button`, `.canv-card`, `.canv-list`, `.canv-input`, `.canv-muted` classes.

## Activation events

Canv automatically infers `"onPanelOpen:<location>:<id>"` from each panel contribution.
Explicit `activationEvents` are only needed for `"onStartup"`.

## Minimal complete example — word count

```json
{
  "manifest": {
    "id": "word-count",
    "name": "Word Count",
    "version": "1.0.0",
    "description": "Shows word and character count for the active document.",
    "capabilities": ["activeDoc.read", "events.docChanged"],
    "contributions": [{
      "type": "panel",
      "id": "main",
      "title": "Word Count",
      "icon": "bar-chart",
      "location": "left-sidebar",
      "entry": "panels/main.html"
    }]
  },
  "files": {
    "panels/main.html": "<!doctype html><html><head><meta charset='utf-8'><style>body{padding:var(--canv-space-3);display:flex;flex-direction:column;gap:var(--canv-space-3)}.row{display:flex;justify-content:space-between;align-items:center;padding:var(--canv-space-2) 0;border-bottom:1px solid var(--canv-border)}.row:last-child{border-bottom:none}.label{color:var(--canv-text-muted);font-size:var(--canv-font-size-sm)}.value{font-weight:600;font-size:var(--canv-font-size-md)}</style></head><body><div class='row'><span class='label'>Words</span><span class='value' id='words'>—</span></div><div class='row'><span class='label'>Characters</span><span class='value' id='chars'>—</span></div><div class='row'><span class='label'>Lines</span><span class='value' id='lines'>—</span></div><script src='./main.js'></script></body></html>",
    "panels/main.js":   "async function update(){const t=await canv.activeDoc.getText()||'';document.getElementById('words').textContent=t.trim()?t.trim().split(/\\s+/).length:0;document.getElementById('chars').textContent=t.length;document.getElementById('lines').textContent=t.split('\\n').length}update();canv.events.on('activeDocChanged',update);canv.lifecycle.onUnload(()=>{})"
  }
}
```

**Note:** the script lives in a separate `panels/main.js` file. Inline `<script>...</script>` is CSP-blocked.

## Pitfalls

- **`location: "right-sidebar"`** — runtime rejects this; use `"left-sidebar"`.
- **Missing capability + API call** → `CapabilityError` at runtime; the panel loads blank.
- **`<link href='canv-ui.css'>`** — breaks styling; it auto-injects.
- **Forgetting `canv.lifecycle.onUnload`** → event subscriptions leak across panel reloads.
- **Emoji in `title`** — shown in the panel tab; design review rejects it.
- **Multiple panels**: each needs a distinct `id`; activation events are inferred per panel.
