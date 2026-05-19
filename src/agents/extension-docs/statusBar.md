# learn_statusBar — Status bar contribution

A status bar item adds a persistent indicator to Canv's bottom status bar.
Items can display text, an icon, a tooltip, and optionally invoke a command when clicked.

## Manifest shape

```json
{
  "type": "statusBar",
  "id": "word-count-status",
  "alignment": "right",
  "priority": 10,
  "text": "0 words",
  "icon": "bar-chart",
  "tooltip": "Document word count",
  "command": "show-word-count-panel"
}
```

## Field semantics

| Field | Required | Notes |
|---|---|---|
| `type` | YES | Always `"statusBar"` |
| `id` | YES | Unique within this extension. Used with `canv.ui.setStatusBarItem`. |
| `alignment` | YES | `"left"` or `"right"` — which end of the status bar to anchor to. |
| `priority` | YES | Integer. Higher priority = closer to the alignment edge. |
| `text` | no | Initial text label. Can be updated dynamically. |
| `icon` | no | `<canv-icon>` name shown before text. |
| `tooltip` | no | Hover tooltip string. |
| `command` | no | Command `id` to invoke when the item is clicked. |

## Priority zones — avoid built-in collisions

Canv's own status bar items occupy fixed priority ranges. Extensions should stay within:

- **Right zone**: priorities `1–49` (built-ins start at 50)
- **Left zone**: priorities `1–59` (built-ins start at 60)

Higher number = closer to the edge. Two items at the same priority are ordered by install time.

## Activation

The `onStatusBarRender` activation event is automatically inferred from any `statusBar` contribution.
You do not need to declare it in `activationEvents`.

## Live updates — `canv.ui.setStatusBarItem`

Update the item's display properties at runtime. All fields are optional (partial update):

```js
canv.ui.setStatusBarItem('word-count-status', {
  text: '1 042 words',
  tooltip: '1 042 words — click to open panel',
})
```

No capability is required to call `setStatusBarItem`. The entry JS runs at startup (when the bar renders).

## Entry JS contract

The `entry` field points to a JS file that registers the live update logic. It runs once when the status bar is first rendered.

```js
// statusbar/wordcount.js
async function refresh() {
  const text = await canv.activeDoc.getText()
  const count = text.trim() ? text.trim().split(/\s+/).length : 0
  canv.ui.setStatusBarItem('word-count-status', { text: `${count} words` })
}

refresh()
canv.events.on('activeDocChanged', refresh)
canv.events.on('docSaved', refresh)
canv.lifecycle.onUnload(() => {})  // subscriptions auto-clean on unload
```

## Minimal complete example — live word count in status bar

```json
{
  "manifest": {
    "id": "status-word-count",
    "name": "Status Bar Word Count",
    "version": "1.0.0",
    "capabilities": ["activeDoc.read", "events.docChanged", "events.docSaved"],
    "contributions": [
      {
        "type": "statusBar",
        "id": "wc-status",
        "alignment": "right",
        "priority": 20,
        "text": "— words",
        "icon": "bar-chart",
        "tooltip": "Document word count"
      }
    ]
  },
  "files": {
    "statusbar/wc.js": "async function refresh(){const t=await canv.activeDoc.getText()||'';const n=t.trim()?t.trim().split(/\\s+/).length:0;canv.ui.setStatusBarItem('wc-status',{text:n+' words',tooltip:'Word count: '+n});}refresh();canv.events.on('activeDocChanged',refresh);canv.events.on('docSaved',refresh);"
  }
}
```

Wait — the contribution needs an `entry` field pointing to the JS file:

```json
{
  "type": "statusBar",
  "id": "wc-status",
  "alignment": "right",
  "priority": 20,
  "text": "— words",
  "icon": "bar-chart",
  "tooltip": "Document word count",
  "entry": "statusbar/wc.js"
}
```

## Pitfalls

- **Priority collision with built-ins** — keep right zone ≤ 49, left zone ≤ 59.
- **Forgetting `entry`** — the item renders its initial `text` but never updates.
- **Missing capability for API calls in entry** — `getText()` needs `activeDoc.read`, events need the matching `events.*` cap.
- **`setStatusBarItem` with wrong `id`** — silently ignored; the id must exactly match the contribution `id`.
- **`command` pointing to undefined command** — the click silently does nothing; ensure the `command` contribution exists in the same extension.
- **No `canv.lifecycle.onUnload` cleanup** — event subscriptions from the statusBar entry can accumulate if the bar re-renders.
