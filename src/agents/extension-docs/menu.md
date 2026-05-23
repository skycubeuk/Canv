# learn_menu — Menu contribution

A menu contribution adds an item to a context menu in Canv's UI.
In v1, the only supported menu is `"fileTree.context"` — the right-click menu on files and folders in the file tree.

Menu items **reference a command** declared by the same extension. The command receives
the right-clicked file's relative path as its first argument.

## Manifest shape

```json
{
  "type": "menu",
  "menu": "fileTree.context",
  "command": "convert-to-pdf",
  "title": "Convert to PDF",
  "when": "fileExt:.md"
}
```

## Field semantics

| Field | Required | Notes |
|---|---|---|
| `type` | YES | Always `"menu"` |
| `menu` | YES | Target menu. v1: `"fileTree.context"` only. |
| `command` | YES | The `id` of a command contribution in the same extension. |
| `title` | no | Override label shown in the menu. Defaults to the command's `title`. |
| `when` | no | Condition expression — see grammar below. Omit to always show. |

## `when` grammar

| Expression | Matches |
|---|---|
| `fileExt:.<ext>` | Files with that extension (e.g. `fileExt:.md`) |
| `isFile` | Any file (not a folder) |
| `isDir` | Any folder (not a file) |

Combine with `&&` for AND, `\|\|` for OR: `"fileExt:.md \|\| fileExt:.txt"`.

The `when` expression is evaluated against the right-clicked item. If false, the item is hidden (not greyed out).

## How args flow

When a menu item is clicked, Canv calls the referenced command's `onInvoke` handler with:

```js
args = ['relative/path/to/file.md']   // args[0] is the relative path from workspace root
```

The command entry JS must handle this:

```js
canv.commands.onInvoke(async (id, args) => {
  const filePath = args[0]   // e.g. 'notes/draft.md'
  if (!filePath) return      // called from palette — no path
  const text = await canv.workspace.readText(filePath)
  // ... do something with text
})
```

## Complete example — word count for any file in tree

This extension adds a "Count Words" item to the right-click menu for `.md` and `.txt` files.
It requires both a `command` and a `menu` contribution.

```json
{
  "manifest": {
    "id": "file-word-count",
    "name": "File Word Count",
    "version": "1.0.0",
    "capabilities": ["workspace.read", "notify"],
    "contributions": [
      {
        "type": "command",
        "id": "count-words-in-file",
        "title": "Count Words in File",
        "entry": "commands/count.js"
      },
      {
        "type": "menu",
        "menu": "fileTree.context",
        "command": "count-words-in-file",
        "title": "Count Words",
        "when": "fileExt:.md || fileExt:.txt"
      }
    ]
  },
  "files": {
    "commands/count.js": "canv.commands.onInvoke(async (id, args) => { const path = args[0]; if (!path) return; const text = await canv.workspace.readText(path); const words = text.trim() ? text.trim().split(/\\s+/).length : 0; await canv.ui.notify(`${path}: ${words} words`, 'info'); });"
  }
}
```

## Pitfalls

- **v1 only supports `"fileTree.context"`** — do not invent other menu targets (e.g. `"editor.context"`); they will be silently ignored.
- **`command` must match an `id` in a `command` contribution in the same extension** — referencing a command from another extension or an undefined id is an error.
- **`when` typo** — an invalid `when` expression hides the item permanently; test with `isFile` first.
- **No `args[0]` guard** — if the user also binds the command via palette or keybinding, `args` will be `[]`; always guard.
- **No separate entry file for the menu** — menus have no entry of their own; the action is handled entirely by the referenced command's JS.
- **`title` in menu overrides command title only in the menu** — the palette still shows the command's original `title`.
