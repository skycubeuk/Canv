# Recipe: command-only extension (command + file-tree menu, no panel)

The most common "do something to this file/folder" extension: a `command` plus `menu` items, no panel UI. The result of triggering it is a notification, not a window.

## The one thing that trips everyone up

The runtime loads **exactly one HTML page** per extension (first `panel` entry → first `fileHandler` entry → else **`index.html`**). It does **NOT** load `command` entry JS by itself — `command.entry` is metadata. With no panel, your extension's host page is `index.html`, and **`index.html` must `<script src>` the command JS** or `canv.commands.onInvoke` never registers and the menu item is a **silent no-op** (no toast, no error, nothing in DevTools).

## Files

```
my-tool/
  manifest.json
  index.html             # host page the runtime loads; <script src>s the command JS
  commands/run.js        # registers canv.commands.onInvoke
```

## Manifest

Note: required `engines`; `command.id` is dotted-lowercase (no hyphens); one `menu` per `when` clause (no boolean operators); declare only capabilities you actually call (`canv.ui.notify` → `notify`, NOT `ui`).

```json
{
  "id": "my-tool",
  "name": "My Tool",
  "version": "1.0.0",
  "engines": { "canv": "^1.0.0" },
  "description": "Right-click a .md file or a folder to run My Tool.",
  "capabilities": ["workspace.list", "workspace.read", "notify"],
  "contributions": [
    { "type": "command", "id": "mytool.run", "title": "Run My Tool", "entry": "index.html" },
    { "type": "menu", "menu": "fileTree.context", "command": "mytool.run", "title": "Run My Tool", "when": "fileExt:.md" },
    { "type": "menu", "menu": "fileTree.context", "command": "mytool.run", "title": "Run My Tool", "when": "isDir" }
  ]
}
```

## Host page

`my-tool/index.html` — its only job is to load the command JS:

```html
<!doctype html>
<html><head><meta charset="utf-8"></head><body>
  <script src="./commands/run.js"></script>
</body></html>
```

## Command JS

`my-tool/commands/run.js`:

```js
canv.commands.onInvoke(async (id, args) => {
  if (id !== 'mytool.run') return            // one handler can serve many commands; branch on id
  const path = args[0]                       // fileTree.context passes the right-clicked relPath
  if (!path) {                               // palette/keybinding invocation passes []
    await canv.ui.notify('Right-click a file or folder to run My Tool.', 'warn')
    return
  }
  const isFolder = !/\.(md|markdown)$/i.test(path)  // menu when-clauses guarantee .md/.markdown OR a folder
  try {
    if (isFolder) {
      const tree = await canv.workspace.list(path)   // returns a TREE node, walk .children
      const mdFiles = (tree.children || []).filter((c) => c.kind === 'file' && /\.md$/i.test(c.name))
      await canv.ui.notify(`${path}: ${mdFiles.length} markdown file(s)`, 'info')
    } else {
      const text = await canv.workspace.readText(path)
      await canv.ui.notify(`${path}: ${text.split(/\s+/).filter(Boolean).length} words`, 'info')
    }
  } catch (e) {
    await canv.ui.notify(`My Tool failed: ${e.message}`, 'error')
  }
})
```

## Bundling third-party / multi-file logic

If your handler imports other modules or an npm package, bundle them into a single self-contained file with esbuild and load THAT from `index.html` (CSP forbids bare ESM `import` from arbitrary paths and CDN scripts):

```bash
npx esbuild --bundle --format=iife --platform=browser \
  --outfile=commands/run.js commands/run.src.js
```

`--format=iife` yields a classic script with no `import`/`export` — maximally compatible. The bundle references the global `canv`, which esbuild leaves undeclared (Canv injects it at runtime). Keep handler logic in pure, separately-tested modules; the bundled `run.js` is just the thin glue that calls the Canv API.

## Known gotchas

- **No `index.html` → silent no-op.** This is the #1 failure for command/menu-only extensions. The menu item appears, but nothing runs because no page loaded the handler.
- **`args` shape:** `args[0]` is the right-clicked relPath from a menu; `args` is `[]` from the palette/keybinding. Always guard.
- **`when` has no booleans** (`fileExt:.<ext>` | `isFile` | `isDir`). For multiple extensions or files+folders, declare multiple `menu` entries pointing at the same command.
- **Don't over-declare capabilities:** `canv.ui.notify` needs `notify`; `ui` is only for `confirm`/`quickPick`/`input`/`copyToClipboard`.
- **After any change:** rebuild the bundle, then uninstall + reinstall — Canv copies files at install time.
```
