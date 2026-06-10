# Canv Extension Author — shared conventions

This reference documents conventions for authoring Canv extensions. Refer to the contribution type documentation (`panel.md`, `command.md`, etc.) for specific details about each contribution type.

## ID rules — the most-broken rule

`id` fields look the same everywhere but use **two different regexes**. Get it wrong and the install consent modal rejects the manifest with `Invalid string: must match pattern …`.

| Where | Regex | Style | Examples that PASS | Examples that FAIL |
|---|---|---|---|---|
| `manifest.id` | `/^[a-z][a-z0-9-]{0,63}$/` | kebab-case | `"pdf-viewer"`, `"word-count"`, `"todo"` | `"PdfViewer"`, `"pdfViewer"`, `"pdf_viewer"`, `"1foo"` |
| `panel.id` | `/^[a-z][a-z0-9-]{0,63}$/` | kebab-case | `"main"`, `"chapter-outline"` | same failure modes as above |
| `fileHandler.id` | `/^[a-z][a-z0-9-]{0,63}$/` | kebab-case | `"main"`, `"image-grid"` | same |
| `statusBar.id` | `/^[a-z][a-z0-9-]{0,63}$/` | kebab-case | `"word-count"`, `"git-branch"` | same |
| **`command.id`** | `/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)*$/` | **dotted-lowercase, NO hyphens** | `"format"`, `"git.pull"`, `"wordcount.refresh"` | `"format-selection"` (hyphen!), `"Format"`, `"word_count"`, `".foo"`, `"foo."` |

**The command id is the trap.** Every other id uses hyphens; command ids use dots. Don't mix them.

For all id fields: lowercase ASCII letters/digits only, must start with a letter, no spaces, no emoji, no Unicode.

## Manifest field overview

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | YES | kebab-case, `[a-z][a-z0-9-]{0,63}`. No slashes. |
| `name` | string | YES | Human-readable, ≤80 chars. No emoji. |
| `version` | string | YES | Semver `"1.0.0"`. Bump patch on every iteration. |
| `description` | string | no | ≤2000 chars. Required when elevated caps are declared. |
| `capabilities` | string[] | YES | Every capability your code uses — omitting one throws `CapabilityError`. |
| `network` | string[] | no | Bare hostnames only (`"api.openai.com"`). Default `[]`. |
| `executables` | string[] | no | Allowlist of bare binary names the extension may run via `canv.process.exec` (e.g. `"pandoc"`). Requires the **elevated** `process` capability. Default `[]`. |
| `writePaths` | string[] | no | Workspace-relative path prefixes the extension may write to via `canv.workspace.writeText` (e.g. `"Feedback/"`). Requires `workspace.write`. Default `[]`. |
| `contributions` | object[] | YES | One entry per panel/fileHandler/command/menu/statusBar/language. |
| `settings` | object[] | no | User-facing settings — see `learn_manifest_full`. |
| `activationEvents` | string[] | no | Omit unless you need `"onStartup"`. Inferred from contributions otherwise. |

Deep schema details can be found in `reference/manifest-schema.md`.

## Visual consistency — mandatory

- **CSS**: use ONLY `--canv-*` variables. Never hard-code hex, `rgb()`, or system font names.
  Key vars: `--canv-color-panel`, `--canv-color-elev`, `--canv-color-accent`, `--canv-color-accent-fg`,
  `--canv-text`, `--canv-text-muted`, `--canv-text-subtle`, `--canv-border`, `--canv-border-strong`,
  `--canv-font-sans`, `--canv-font-size-{xs,sm,md,lg}`, `--canv-space-{1..6}`, `--canv-radius`.
- **Icons**: `<canv-icon name="bar-chart" size="16"></canv-icon>` ONLY. Never `<img>`, never emoji in UI chrome.
- **Assets**: `canv-ui.css` and `<canv-icon>` are **auto-injected** — do NOT add `<link>` or `<script>` tags for them.
- **Scripts**: Put ALL JavaScript in separate `.js` files referenced via `<script src="./main.js"></script>`. **Inline `<script>...</script>` is BLOCKED by the extension's CSP** (`script-src 'self' canv-extension://canv-shared` — no `'unsafe-inline'`). Inline event handlers like `onclick="..."` are also blocked; wire events with `addEventListener` from your external script.
- **Density**: small padding, subtle borders, editor-grade feel — not a marketing page.

## Iteration semantics

- Regenerate the **entire payload** (`manifest` + all `files`). Never emit a diff.
- Preserve the manifest `id` across iterations unless the user renames the extension.
- Bump `version` at patch level on every iteration (`1.0.0` → `1.0.1` → `1.0.2`).

## BAD example — snapshot of failure modes

`capabilities: []` with `canv.activeDoc.getText()` → `CapabilityError`. `location: "right-sidebar"` → rejected by runtime. `<link href='canv-ui.css'>` → breaks styling (it auto-injects). Hard-coded `background:#1a1a2e` → rejects design review. Emoji in name or panel chrome → rejected.

## Network whitelist rule

HTTPS only. List bare hostnames — no scheme, no path, no port. Most extensions need no network access.

## Running binaries + writing files (elevated)

Two elevated capabilities let an extension reach outside the sandbox. Both are surfaced prominently
in the install consent modal, so declare the minimum and explain why in `description`.

- **`process`** + `manifest.executables`: run an allowlisted binary on the user's machine via
  `canv.process.exec(binary, args)`. The host runs it with `execFile` (no shell — args are passed as
  an array, never interpolated), pins the working directory to the workspace root, and only allows
  binaries listed in `executables` (bare names resolved from `PATH` — no slashes/absolute paths). A
  non-zero exit resolves with `{ exitCode, stdout, stderr }` rather than throwing.
- **`workspace.write`** + `manifest.writePaths`: write a UTF-8 file via
  `canv.workspace.writeText(rel, text)`. The path must fall under one of the declared `writePaths`
  prefixes and inside the workspace (no `..`, no absolute).

## Pre-emit checklist

- [ ] `activeDoc.read` declared if any `canv.activeDoc.getText/getPath/getSelection` call exists
- [ ] `activeDoc.write` declared if any `insertAtCursor`, `replaceSelection`, or `setText` call exists
- [ ] Correct `events.*` cap for each `canv.events.on(...)` call
- [ ] `notify` declared if `canv.ui.notify` is called
- [ ] `ui` declared if `canv.ui.confirm`, `quickPick`, `copyToClipboard`, or `input` is called
- [ ] `net` declared AND hostnames in `manifest.network` if `canv.net.fetch` is called
- [ ] `process` declared AND binary names in `manifest.executables` if `canv.process.exec` is called
- [ ] `workspace.write` declared AND path prefixes in `manifest.writePaths` if `canv.workspace.writeText` is called
- [ ] All CSS colours/fonts use `--canv-*` vars — no hex, no `rgb()`, no system fonts
- [ ] Every `contribution.entry` path is a key in `files`
- [ ] HTML is self-contained — no `<link>` to canv-ui.css, no external CDN scripts
- [ ] JavaScript lives in a separate `.js` file referenced via `<script src="...">` — NOT inline `<script>...</script>`
- [ ] No emoji in UI chrome (toolbar labels, headings, buttons)
- [ ] `<canv-icon>` used for iconography, not `<img>` or emoji
- [ ] `panel.location` is `"left-sidebar"` or `"bottom-dock"` — never `"right-sidebar"`
