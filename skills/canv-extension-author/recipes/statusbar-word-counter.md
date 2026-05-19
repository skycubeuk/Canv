# Recipe: statusbar-word-counter

A status-bar item that shows live word count for the active markdown document.

## What it does

Subscribes to `activeDocChanged` and `docChanged` events, counts words in the current document text, and updates a status-bar segment in real time. The panel iframe is invisible — it exists only to host the JS logic.

## Files

```
word-count-statusbar/
  manifest.json       # declares a panel (invisible) + a statusBar contribution
  panels/main.html    # zero-size iframe; loads main.js
  panels/main.js      # subscribes to events, updates the status bar
```

## Setup steps

```bash
mkdir -p word-count-statusbar/panels
# Write the three files below, then install via Canv → Extensions tab → Install from folder.
```

## Manifest

`word-count-statusbar/manifest.json`

```json
{
  "id": "word-count-statusbar",
  "name": "Word Count",
  "version": "0.1.0",
  "description": "Shows live word count in the status bar.",
  "capabilities": ["activeDoc.read", "events.docChanged", "ui"],
  "contributions": {
    "panels": [
      {
        "id": "word-count-statusbar.logic",
        "label": "Word Count Logic",
        "location": "hidden",
        "panel": "panels/main.html"
      }
    ],
    "statusBar": [
      {
        "id": "word-count-statusbar.count",
        "alignment": "right",
        "priority": 100,
        "text": "0 words"
      }
    ]
  }
}
```

## Panel HTML

`word-count-statusbar/panels/main.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
</head>
<body>
  <script type="module" src="main.js"></script>
</body>
</html>
```

## Panel JS

`word-count-statusbar/panels/main.js`

```js
// The canv global is injected by the host before this script runs.
const ITEM_ID = 'word-count-statusbar.count'

function countWords(text) {
  if (!text || !text.trim()) return 0
  return text.trim().split(/\s+/).length
}

async function update() {
  let text = ''
  try {
    text = await canv.activeDoc.getText()
  } catch {
    // No active doc — leave count at 0.
  }
  const n = countWords(text)
  canv.ui.setStatusBarItem(ITEM_ID, {
    text: `${n} ${n === 1 ? 'word' : 'words'}`
  })
}

// Update on load.
update()

// Update whenever the active document changes (user switches tabs).
canv.events.on('activeDocChanged', update)

// Update as the user types.
canv.events.on('docChanged', update)
```

## Known gotchas

- **`location: "hidden"`** suppresses the panel icon from the sidebar. Canv still loads the iframe; it just has no visible affordance. Use this whenever a panel's sole job is to run JS logic.
- **`canv.activeDoc.getText()` can throw** if no document is open. Wrap it in try/catch or check `canv.activeDoc.isOpen()` first.
- **`setStatusBarItem(id, partial)`** merges the partial into the existing item declared in the manifest. Only send the keys that changed — `text`, `tooltip`, `color`, `command`.
- **`priority`** in the `statusBar` contribution: higher numbers appear further from the status-bar edge. Right-zone items: 100 is a safe default. Left-zone items use the same scale but on the opposite side.
- The `"ui"` capability is required to call `canv.ui.*` methods. Without it the calls are no-ops and a console warning is emitted.
