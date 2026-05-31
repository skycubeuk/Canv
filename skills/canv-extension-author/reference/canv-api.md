# Canv API reference

All APIs are **async** (return Promises). They are injected as `window.canv` in every panel HTML context
and in command / statusBar entry JS files.

## Capabilities table

Declare every capability your code actually uses. The runtime enforces this — a missing declaration throws `CapabilityError`.

| Capability | Required when you call |
|---|---|
| `activeDoc.read` | `canv.activeDoc.getText`, `.getPath`, `.getSelection`, `.getBytes` |
| `activeDoc.write` | `canv.activeDoc.insertAtCursor`, `.replaceSelection`, `.setText`, `.setBytes` |
| `workspace.list` | `canv.workspace.getRoot`, `.list` |
| `workspace.read` | `canv.workspace.readText` |
| `workspace.write` | `canv.workspace.writeText` (paths must be under `manifest.writePaths`) |
| `process` | `canv.process.exec` (binary must be in `manifest.executables`) |
| `selection.read` | *(use `activeDoc.read` for `getSelection`)* |
| `events.docChanged` | `canv.events.on('activeDocChanged', ...)` or `canv.events.on('activeFile.changed', ...)` |
| `events.selectionChanged` | `canv.events.on('selectionChanged', ...)` |
| `events.docSaved` | `canv.events.on('docSaved', ...)` |
| `events.workspaceChanged` | `canv.events.on('workspaceChanged', ...)` |
| `storage` | `canv.storage.*` |
| `settings` | `canv.settings.*` |
| `ai` | `canv.ai.ask` |
| `notify` | `canv.ui.notify` |
| `ui` | `canv.ui.confirm`, `.copyToClipboard`, `.quickPick`, `.input` |
| `net` | `canv.net.fetch` |

**Don't declare capabilities you don't use.** Users see the full list at install time.
For elevated capabilities (`ai`, `net`, `process`, `workspace.write`, `activeDoc.write`), explain why in `description`.

---

## `canv.activeDoc` — requires `activeDoc.read` / `activeDoc.write`

```js
const text  = await canv.activeDoc.getText()          // full document text as string
const path  = await canv.activeDoc.getPath()          // absolute file path or null
const sel   = await canv.activeDoc.getSelection()     // { text, start, end }
const bytes = await canv.activeDoc.getBytes()         // Uint8Array — for fileHandler use

await canv.activeDoc.insertAtCursor(text)             // requires activeDoc.write
await canv.activeDoc.replaceSelection(text)           // requires activeDoc.write
await canv.activeDoc.setText(text)                    // replaces entire document; requires activeDoc.write
await canv.activeDoc.setBytes(uint8Array)             // saves file bytes; requires activeDoc.write (fileHandler mode:'editor' only)
```

- `getSelection()` returns `{ text: string, start: number, end: number }` (character offsets).
- `getBytes()` / `setBytes()` are intended for `fileHandler` contributions. Avoid in panel code unless you need binary access.

---

## `canv.workspace` — requires `workspace.list` / `workspace.read` / `workspace.write`

```js
const root = await canv.workspace.getRoot()           // absolute dir path of the open workspace
const tree = await canv.workspace.list(relDir)        // directory tree (see shape below)
const text = await canv.workspace.readText(rel)       // file contents as UTF-8 string
await canv.workspace.writeText(rel, text)             // write UTF-8 file; requires workspace.write
```

- `list(relDir)` takes a workspace-relative **directory** (omit/`''` for the root) and returns a
  recursive tree node — NOT a flat glob list:
  ```js
  { name, relPath, kind: 'dir', children: [ { name, relPath, kind: 'file' | 'dir', ... } ], truncated }
  ```
  Walk `children` and filter on `kind === 'file'` + the extension you want. Dot-directories (e.g.
  `.canv/`) are omitted from the tree.
- `readText` reads any file in the workspace, **including** dot-dirs the tree hides — e.g.
  `readText('.canv/annotations/<chapter>.md.json')` returns a chapter's annotation sidecar. Paths
  are relative to the workspace root.
- `writeText` requires the **elevated** `workspace.write` capability AND that `rel` falls under one of
  the prefixes in `manifest.writePaths` (e.g. `"Feedback/"`). It creates parent directories as needed.
  Paths that escape the workspace (`..`, absolute) are rejected.

---

## `canv.process` — requires `process` (elevated)

Run an allowlisted external binary on the user's machine. **This is the most powerful capability** —
the install consent modal lists every binary the extension may run. Declare it only when essential
and explain why in `description`.

```js
const r = await canv.process.exec('pandoc', ['in.md', '-o', 'out.pdf', '--pdf-engine=xelatex'])
// r = { exitCode: number, stdout: string, stderr: string, error?: string }
if (r.exitCode !== 0) canv.ui.notify(`pandoc failed: ${r.stderr || r.error}`, 'error')
```

- The binary **must** be listed in `manifest.executables` (bare name resolved from `PATH` — no
  slashes or absolute paths). A binary not in the allowlist throws.
- Runs via `execFile` (no shell): `args` is an array of strings passed verbatim — there is no shell
  interpolation, globbing, or piping. Build pipelines by writing intermediate files with
  `canv.workspace.writeText` and chaining `exec` calls.
- The working directory is the workspace root, so relative paths in `args` resolve there.
- A non-zero exit **resolves** (it does not throw) with `exitCode`/`stdout`/`stderr` so you can show
  the tool's own diagnostics. A spawn failure (e.g. binary missing) resolves with `exitCode: 1` and
  an `error` message.

---

## `canv.events` — requires matching `events.*` capability

```js
const unsub = canv.events.on('activeDocChanged', (doc) => { /* doc: { path, text } */ })
const unsub = canv.events.on('activeFile.changed', () => { /* file switched in fileHandler */ })
const unsub = canv.events.on('selectionChanged', (sel) => { /* sel: { text, start, end } */ })
const unsub = canv.events.on('docSaved', (doc) => { /* doc: { path } */ })
const unsub = canv.events.on('workspaceChanged', (ws) => { /* ws: { root } */ })
```

`unsub()` removes the listener. **Always call `unsub()` inside `canv.lifecycle.onUnload`** to avoid leaks.

---

## `canv.storage` — requires `storage`

Per-extension persistent key-value store. Values survive app restarts. Data is scoped to the extension `id`.

```js
await canv.storage.get(key)            // → value | undefined
await canv.storage.set(key, value)     // value must be JSON-serialisable
await canv.storage.delete(key)
const allKeys = await canv.storage.keys()   // → string[]
```

---

## `canv.settings` — requires `settings`

User-facing settings declared in `manifest.settings`. Values survive app restarts.

```js
const val   = await canv.settings.get(key)            // → value | default
await canv.settings.set(key, value)
const all   = await canv.settings.getAll()            // → { key: value, ... }
const unsub = canv.settings.onChange((key, value) => { /* react to user changes */ })
```

Always unsubscribe `onChange` in `canv.lifecycle.onUnload`.

---

## `canv.ai` — requires `ai`

Proxies through the user's configured AI profile. Use sparingly — it costs the user compute.

```js
const reply = await canv.ai.ask(prompt, {
  model: 'auto',       // optional — let Canv pick the model
  maxTokens: 500,      // optional — cap response length
})
// reply is a plain string
```

- `model: 'auto'` is recommended; it lets Canv choose based on the user's configured profile.
- Include a clear `description` in the manifest explaining why `ai` is needed.

---

## `canv.net` — requires `net`

HTTPS-only fetch proxy. The URL's hostname **must** be listed in `manifest.network`.

```js
const res  = await canv.net.fetch(url, init)   // init is a RequestInit subset
const json = await res.json()
const text = await res.text()
// Available: res.ok, res.status, res.statusText, res.headers
```

- HTTP (non-TLS) is blocked.
- `init` supports `method`, `headers`, `body`. Streaming and binary responses are not supported.
- List only hostnames you actively call. Most useful extensions need no network access at all.

---

## `canv.ui` — requires `notify` for notify, `ui` for the rest

```js
await canv.ui.notify(message, kind)                         // kind: 'info'|'success'|'warning'|'error'
const yes   = await canv.ui.confirm(msg)                    // → boolean
await canv.ui.copyToClipboard(text)
const pick  = await canv.ui.quickPick(items, opts)          // opts: { placeholder?, canPickMany? }
const value = await canv.ui.input({ placeholder, value, prompt })
canv.ui.setStatusBarItem(id, partial)                       // no capability needed
```

- `quickPick(items)` — `items` is `string[]`; returns the selected string or `null` (or `string[]` if `canPickMany`).
- `input()` — returns the entered string or `null` if cancelled.
- `setStatusBarItem(id, partial)` — updates a status bar item declared by this extension. No capability required.

---

## `canv.commands` — no capability needed

Used in command entry JS files to register the invoke handler.

```js
canv.commands.onInvoke(async (id, args) => {
  // id   — command id string
  // args — [] from palette/keybinding, ['rel/path'] from fileTree.context menu
})
```

---

## `canv.lifecycle` — no capability needed

```js
canv.lifecycle.onActivate((ctx) => { /* panel is shown or entry has loaded */ })
canv.lifecycle.onUnload((ctx)   => { /* clean up subscriptions, timers, etc. */ })
```

Available in all entry contexts (panels, commands, statusBar, fileHandlers).
`onUnload` is the correct place to call all `unsub()` functions.
