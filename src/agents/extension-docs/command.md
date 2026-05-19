# learn_command — Command contribution

A command registers a callable action that appears in Canv's command palette
and optionally binds to a keyboard shortcut. Commands are also the action target
for menu contributions — see `learn_menu`.

## Manifest shape

```json
{
  "type": "command",
  "id": "format-selection",
  "title": "Format Selection as Markdown Table",
  "entry": "commands/format.js",
  "keybinding": "Ctrl+Shift+T"
}
```

## Field semantics

| Field | Required | Notes |
|---|---|---|
| `type` | YES | Always `"command"` |
| `id` | YES | Unique within this extension. Palette shows this if no `title`. |
| `title` | YES | Human-readable label in the command palette. No emoji. |
| `entry` | YES | Relative path to a **JS file** (not HTML). Must be a key in `files`. |
| `keybinding` | no | Key chord string — see keybinding syntax below. |

## Keybinding syntax

- Use `Ctrl`, `Shift`, `Alt`, `Meta`, `CmdOrCtrl` as modifiers.
- `CmdOrCtrl` maps to `Cmd` on macOS and `Ctrl` on Windows/Linux — **prefer this over bare `Ctrl`**.
- Examples: `"CmdOrCtrl+S"`, `"Ctrl+Shift+W"`, `"Alt+F4"`, `"CmdOrCtrl+K CmdOrCtrl+F"` (chord).
- Canv rejects bindings that conflict with reserved editor shortcuts.

## Handler contract — `canv.commands.onInvoke`

The entry JS file must register an invoke handler. The runtime calls it when the command fires.

```js
// commands/format.js
canv.commands.onInvoke(async (id, args) => {
  // id   — the command id string (useful when one file handles multiple commands)
  // args — [] when invoked from the palette or keybinding
  //         ['relative/path.md'] when invoked from a fileTree.context menu item
  if (id === 'format-selection') {
    const sel = await canv.activeDoc.getSelection()
    if (!sel.text) return
    const formatted = toMarkdownTable(sel.text)
    await canv.activeDoc.replaceSelection(formatted)
  }
})
```

- The handler must be **synchronous registration** (the `onInvoke` call itself), though the callback can be async.
- One entry file per command contribution. If you have multiple commands, use multiple entries.

## Capabilities needed

Commands use the same `canv.*` API as panels. Declare the matching capability for every API call in the entry file.

## Minimal complete example — insert timestamp

```json
{
  "manifest": {
    "id": "insert-timestamp",
    "name": "Insert Timestamp",
    "version": "1.0.0",
    "capabilities": ["activeDoc.write"],
    "contributions": [{
      "type": "command",
      "id": "insert-timestamp",
      "title": "Insert Current Timestamp",
      "entry": "commands/timestamp.js",
      "keybinding": "CmdOrCtrl+Shift+D"
    }]
  },
  "files": {
    "commands/timestamp.js": "canv.commands.onInvoke(async (id, args) => { const ts = new Date().toISOString(); await canv.activeDoc.insertAtCursor(ts); });"
  }
}
```

## Pitfalls

- **Entry is a JS file, not HTML** — commands have no visible UI; they run headlessly.
- **Bare `Ctrl` on Mac** — use `CmdOrCtrl` unless you intentionally target Windows/Linux only.
- **`args` when from palette vs menu** — from palette, `args` is `[]`; from a menu, `args[0]` is the file path. Guard accordingly.
- **No `onInvoke` call** — the command silently does nothing; the runtime never errors but the action fires into void.
- **Conflicting keybinding** — Canv will silently drop it; test your binding in the app.
- **Multiple command contributions sharing one entry** — each must have its own `entry` path pointing to its own JS file, OR one file can call `onInvoke` and branch on `id`.
