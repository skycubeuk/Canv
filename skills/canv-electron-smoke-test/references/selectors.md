# Canv selector cheatsheet

Stable selectors for driving the renderer from a Playwright probe. Source-grounded — if you find one that doesn't resolve, or use a selector not listed here, **update this file as part of your probe** (the skill mandates it).

## Conventions used in Canv source

- **`aria-label`** is the primary handle for affordances (every icon button / input / landmark has one unless it's text-only).
- **`role` + landmark `aria-label`** is the handle for regions (`header[role="banner"]`, `nav[aria-label="Breadcrumb"]`, `section[role="region"][aria-label="Bottom panel"]`).
- **`id`** is used sparingly, only for layout-load-bearing containers (`#sidebar`, `#editor`, `#main`, etc.). Auto-generated IDs that look like `_r_0_`, `_r_c_`, or `radix-*` come from React/Radix — ignore them, they aren't stable.
- **`data-testid`** is used for chat / agent / dialog / Settings internals, modal backdrops, toasts, extension slots, and editor tabs where neither aria nor role fits naturally.
- **Text content** (`:has-text(...)` via Playwright API only — see *Selector-strategy notes* below) is the handle for text-only buttons: `Edit` / `Preview`, bottom-panel tabs (`Runs`, `Chat`, `Problems`, `Output`, `History`), and the `Re-run` / `Apply` / `Copy` / `Stop` / `Clear` / `Save` / `Approve` / `Deny` actions.
- **`title`** attributes are everywhere but are not unique — prefer aria-label over title where both exist.

## App shell — load-bearing containers

| Region | Selector | Notes |
|--------|----------|-------|
| React root | `#root` | |
| Top bar | `header[role="banner"]` | Drag region; padding-right reserves space for window-control overlay (~96px on Linux) |
| Activity bar | `div[role="navigation"][aria-label="Activity bar"]` | 48px-wide column of icon buttons |
| Sidebar (semantic) | `aside[aria-label="Sidebar"]` (`role="complementary"`) | Wraps `#sidebar` |
| Sidebar (container) | `#sidebar` | Resizable |
| Sidebar — files pane | `#sidebarFiles` | Top half on the Files tab |
| Sidebar — outline pane | `#sidebarOutline` | Bottom half (only when an active document with parseable headings is open) |
| Main column | `#main` | Everything right of the sidebar |
| Editor frame | `#editor` | Surrounds the editor groups |
| Primary editor pane | `#editorMain` | Active editor group |
| Right dock | `#dockRight` | Right-side panel container when bottom is docked right |
| Bottom panel (semantic) | `section[role="region"][aria-label="Bottom panel"]` | |
| Bottom panel (container) | `#bottom` | Only when `dockPlacement === 'bottom'` |
| Right dock container | `#dockRight` | Only when `dockPlacement === 'right'` |
| Status bar | `div[role="status"][aria-label="Status bar"]` | Footer strip |
| Breadcrumb | `nav[aria-label="Breadcrumb"]` | Above the editor content |

## Top bar

| Affordance | Selector |
|------------|----------|
| Command palette input | `input[aria-label="Command palette"]` (`type=search`) |
| Command palette dropdown | `div[role="listbox"][aria-label="Command palette results"]` |
| Command palette rows | `[aria-label="Command palette results"] li[role="option"]` |
| Dock-right toggle | `button[aria-label="Panel right (dock to right)"]` |
| Dock-bottom toggle | `button[aria-label="Panel bottom (dock to bottom)"]` |
| Dock placement group | `div[role="group"][aria-label="Dock placement"]` (rendered as the bottom-panel `headerRight`; only `popout` button is shown in the topbar context) |
| Pop out dock | `button[aria-label="Pop out dock"]` (inside the bottom-panel header, not the topbar) |
| Workspace-name area (top-left) | text `:has-text("No workspace")` (when empty) or check `<span title="<full path>">` |

Open the palette: `await win.keyboard.press('Control+Shift+P')`. The dropdown is rendered through a portal into `document.body`, not inside `header[role="banner"]` — query globally.

## Activity bar (left edge)

Each button uses `aria-label={label}` and a matching `title`. Built-in tabs (in order, from `WorkspaceShell.tsx`):

| Tab | Selector | Notes |
|-----|----------|-------|
| Files | `button[aria-label="Files"]` | Default |
| Search | `button[aria-label="Search"]` | |
| History | `button[aria-label="History"]` | Gated on `setup.config.revisionArchaeology.enabled === true` |
| Sites | `button[aria-label="Sites"]` | |
| Recordings | `button[aria-label="Recordings"]` | Read-aloud (TTS) recordings panel |
| Extensions | `button[aria-label="Extensions"]` | |

Extension-contributed activity-bar entries follow `button[aria-label="<panel.title>"]`. React key is `ext:<extensionId>:<panelId>` (not in DOM).

Active tab: `[aria-current="page"]`. Clicking the active tab toggles sidebar visibility — confirm via `aside[aria-label="Sidebar"]` presence, not by re-querying the button.

## Sidebar — Files tab

| Affordance | Selector |
|------------|----------|
| New file | `button[aria-label="New file"]` |
| New folder | `button[aria-label="New folder"]` |
| Change workspace | `button[aria-label="Change workspace"]` |
| Open remote workspace | `button[aria-label="Open Remote Workspace"]` |
| Pinned-context badge (per file) | `span[aria-label="<filename> pinned to context"]` |

The file tree itself uses div rows (no `role="treeitem"` per file — that's the outline). Select by text:

```js
await win.click('#sidebarFiles >> text=README.md')               // open file
await win.click('#sidebarFiles >> text=README.md', { button: 'right' }) // context menu
```

Modified-dot uses `title="Modified"`; pinned icon uses `title="Pinned — right-click to unpin"`.

## File-tree right-click menu

Mounts as a portal-style fixed div anchored at the click point.

| Affordance | Selector |
|------------|----------|
| Menu root | `[data-testid="file-tree-context-menu"]` (`role="menu"`, `aria-label="File context menu"`) |
| Menu item | `[role="menuitem"]` (all built-in and extension items) |
| Items by text | `text="New file…"`, `"New folder…"`, `"Pin to context"`, `"Unpin from context"`, `"Rename"`, `"Delete"`, `"Copy path"`, `"View history"` (raEnabled + non-dir), `"Serve as website"` / `"Stop serving"` / `"Serve as website (replaces current)"` (dirs only) |
| Extension "Open with" header | `text="Open with"` |
| Extension "Open with" entries | a `[role="menuitem"]` whose text is the extension id |
| Extension contributed commands | `[role="menuitem"]` matching the command-contribution title — appears under the menu's separator after Copy path |

## Sidebar — Search tab

| Affordance | Selector |
|------------|----------|
| Search query input | `input[aria-label="Search query"]` (placeholder `Search…`) |
| Folder scope input | `input[aria-label="Folder scope"]` (placeholder `Folder (optional, e.g. notes/)`) |
| Regex toggle | `button[aria-pressed][title="Use regular expression"]` (visible text `.*`) |
| Case-sensitive toggle | `button[aria-pressed][title="Match case"]` (visible text `Aa`) |
| Result row (per match) | child link inside the sidebar scroll area; navigate by line `title="Line <n>, column <c>"` |
| Invalid-regex hint | `text="Invalid regular expression."` |

## Sidebar — History tab (`raEnabled` only)

| Affordance | Selector |
|------------|----------|
| Create checkpoint button | `button[aria-label="Create checkpoint"]` |
| Composer input | `input[placeholder="Checkpoint summary"]` |
| Save (commit composer) | `button:has-text("Save")` (inside composer; scope with `#sidebar`) |
| Per-snapshot diff button | `button[title="View diff"]` |
| Per-snapshot restore button | `button[title="Restore from this snapshot"]` |
| Per-row file status badge | `span[aria-label="<status>"]` where status ∈ `modified` / `stale` / `crashed` / `needs trust` |
| Restore-preview dialog | `div[role="dialog"][aria-label="Restore <relPath>"]` (`aria-modal=true`) |
| Restore dialog — Cancel | `button:has-text("Cancel")` inside the dialog |
| Restore dialog — Restore | `button:has-text("Restore")` (becomes `Restoring…` while busy) |

Section headings (`Current changes`, etc.) are plain text — match with `text=` scoped to the History panel.

## Sidebar — Sites tab

| Affordance | Selector |
|------------|----------|
| Pin / unpin per site | `button[aria-label="Pin"]` / `button[aria-label="Unpin"]` |
| Per-row more-actions menu | `button[aria-label="More actions"]` |
| Stale marker | `span[aria-label="stale"]` (title `This site is stale`) |
| Site list root | `ul[role="list"]` inside the Sites panel |

## Sidebar — Extensions tab

Renders `ExtensionsTab` containing `ExtensionRow` entries plus an `InstallExtensionMenu`.

| Affordance | Selector |
|------------|----------|
| Install extension trigger | `button[aria-label="Install extension"]` |
| Install menu | `div[role="menu"]` (immediate sibling — opens on click) |
| "Install from folder…" | `[role="menuitem"]:has-text("Install from folder…")` |
| "Install from .canvext…" | `[role="menuitem"]:has-text("Install from .canvext…")` |
| Per-row expand toggle | `button[aria-label="expand"]` / `button[aria-label="collapse"]` |
| Enable/disable switch | `button[role="switch"][aria-label="enabled"]` (title `Disable` / `Enable` / `Trust this extension to enable it`) |
| Per-row more-actions menu | `button[aria-label="more actions"]` (lowercase — Sites uses capital `More`) |
| More-actions menu items | `[role="menuitem"]:has-text("Trust this extension")` / `"Revoke trust"` / `"Reload"` / `"Uninstall…"` |
| Needs-trust marker | `span[aria-label="needs trust"]` |
| Crashed marker | `span[aria-label="crashed"]` |
| Trust-workspace banner | `div[role="alert"]` (contains `Trust this workspace` button) |
| Trust banner — Review in Sidebar | `button:has-text("Review in Sidebar")` |
| Trust banner — Always disable | `button:has-text("Always disable")` |
| Trust banner — Trust this workspace | `button:has-text("Trust this workspace")` |

## Sidebar — Recordings tab (read-aloud / TTS)

Lists generated audio recordings; the panel title bar carries the "Read this document" action (in the panel header, not the body).

| Affordance | Selector | Notes |
|------------|----------|-------|
| Recording row | `aside[aria-label="Sidebar"] li` | Each `<li>`: play/pause button, label, duration span (`m:ss` or `--:--`), delete button |
| Play row | `button[aria-label="Play <label>"]` | Dynamic — `<label>` is the recording label (doc path or text snippet) |
| Pause row (when playing) | `button[aria-label="Pause <label>"]` | Same button, flips while that row plays |
| Delete row | `button[aria-label="Delete <label>"]` | Dynamic |
| Empty state | `text="No recordings yet"` | Shown when there are no recordings |
| Read this document (header action) | a header-action icon button in the panel header (`SidebarIconButton`) wired to command `tts.readDocument` |
| Now-playing pill (status bar) | rendered by `TtsNowPlaying` in the status bar while audio plays; Pause button `aria-label="Pause"`, label text = playing recording's label |

Recordings can also be triggered without this panel: the floating selection toolbar's speaker (`[data-testid="floating-toolbar"]` → button `aria-label="Read aloud"`, with a `aria-label="Choose voice"` chevron), the command palette (`Read aloud: document`), and the editor right-click menu ("Read aloud", adaptive selection-vs-document). The recordings bridge is `window.canvTTS` (`generate`/`list`/`delete`/`setDuration`/`voices`/`models`); audio is served via the privileged `canv-rec://recordings/<file>` protocol (CSP must allow `media-src canv-rec:`).

## Settings — Read aloud (ElevenLabs)

Lives inside the `provider-keys` section (`[data-testid="settings-section-provider-keys"]`). Search keywords include `tts` / `elevenlabs` / `voice` / `read aloud` / `speech`.

| Affordance | Selector |
|------------|----------|
| ElevenLabs API key input | `input[placeholder="ElevenLabs API key"]` (labelled `<Field label="Read aloud (ElevenLabs) — API key">`) |
| Default voice select | inside `<Field label="Default voice">` — a `<select>` populated from `getTts().voices(provider, key)` |
| Default model select | inside `<Field label="Default model">` — `<select>` populated from `getTts().models(provider, key)` |
| Refresh voices | `button:has-text("Refresh voices")` |

## Outline pane (in sidebar — only when an active document has headings)

| Affordance | Selector |
|------------|----------|
| Tree root | `div[role="tree"][aria-label="Document outline-solid"]` |
| Heading item | `[role="treeitem"]` |
| Toggle heading | `button[aria-label="Toggle <heading text>"]` (dynamic) |

## Editor sub-toolbar (above the editor)

| Affordance | Selector | Notes |
|------------|----------|-------|
| Run-on-document trigger | `button[data-testid="document-agent-menu-trigger"]` | Disabled when no document is open; visible text `Run on document` on ≥sm |
| Run-on-document menu | `div[role="menu"][data-testid="document-agent-menu"]` | |
| Run-on-document items | `[data-testid="document-agent-menu"] button[role="menuitem"]` | |
| Run-on-document instruction input | inside the second-stage `div[role="menu"]` — match by per-agent `placeholder` |
| Back to agent list (instruction step) | `button[aria-label="Back to agent list"]` |
| Edit/Preview toggle (Edit) | `button[aria-pressed]:has-text("Edit")` | Text-only with `aria-pressed` |
| Edit/Preview toggle (Preview) | `button[aria-pressed]:has-text("Preview")` | Same |

## Editor tabs strip (per group)

| Affordance | Selector |
|------------|----------|
| Tab strip root | `div[role="tablist"][aria-label="Editor tabs <groupId>"]` or `[data-testid="editor-tablist-<groupId>"]` |
| Tab handle | `[role="tab"][data-testid="editor-tab-<key>"]` (`aria-selected` reflects active) |
| Tab close (per file) | `button[aria-label="Close <relPath>"]` (dynamic; the close icon nested in the tab) |
| Dirty-indicator | `span[title="Modified"]` inside the tab handle |
| Active-tab accent bar | `span[aria-hidden]` on the active tab (`absolute top-0 ... bg-accent`) — visual only |
| Drag-over outline | the strip root flips `outline-solid outline-2` class while drop-target |

The `<key>` slot in `editor-tab-<key>` is `tabKey(t)`: for markdown tabs it is the relPath, for diff tabs it is `diff:<rel>:<snap>`, for extension tabs `ext:<extensionId>:<relPath>`. Use `[data-testid^="editor-tab-"]` to enumerate all open tabs.

## Editor split groups (`#main` only when split)

| Affordance | Selector |
|------------|----------|
| Solo group container | `#editorMain` (single-group case) |
| Split — left group | `#g1` |
| Split — right group | `#g2` |
| Split separator | rendered by react-resizable-panels; no testid (drag the gap visually) |

When split, each group renders its own `EditorTabs` strip — disambiguate with `[data-testid="editor-tablist-<groupId>"]`.

## Editor content (CodeMirror)

Every open markdown tab mounts its own `.cm-content` instance; inactive tabs are hidden with `visibility: hidden` (zero-size box), **not** unmounted or `display:none`. A bare `#editor .cm-content` or `#editorMain .cm-content` click resolves to the first (often hidden) instance and times out. Use Playwright's `:visible`:

```js
await win.click('#editorMain .cm-content:visible')   // active tab's editor
```

**Verifying autosave**: the status-bar `Saved` text can reflect a previously-saved tab while another tab's 5s debounce is still pending — don't treat `text=Saved` as proof a specific file flushed. Poll the file on disk from the probe (`fs.readFileSync` in a retry loop, ~12s budget) instead.

## Floating selection toolbar

| Affordance | Selector |
|------------|----------|
| Toolbar root | `[data-testid="floating-toolbar"]` |

Appears anchored to the current text selection inside the editor. Inner buttons are text-only and depend on the registered selection-agent set.

## Bottom panel

The header buttons have **no aria-label** — select by visible text inside the region.

| Tab | Selector |
|-----|----------|
| Runs | `section[aria-label="Bottom panel"] button:has-text("Runs")` |
| Chat | `section[aria-label="Bottom panel"] button:has-text("Chat")` |
| Problems | `section[aria-label="Bottom panel"] button:has-text("Problems")` |
| Output | `section[aria-label="Bottom panel"] button:has-text("Output")` |
| History | `section[aria-label="Bottom panel"] button:has-text("History")` |

**Badge gotcha**: once a tab has a numeric badge (e.g. 1 run, 3 unread chat messages), the button's `textContent.trim()` is `Runs1` / `Chat3`, not `Runs` / `Chat`. Use a regex / prefix match inside `evaluate`:
```js
[...document.querySelectorAll('section[aria-label="Bottom panel"] button')]
  .find((b) => /^Runs(\d+)?$/.test(b.textContent?.trim() || ''))?.click()
```
Playwright `:has-text("Runs")` works because it's a substring match — but exact-equality matchers do not.

Auxiliary chrome on the panel header:

| Affordance | Selector |
|------------|----------|
| Hide bottom panel | `button[aria-label="Hide bottom panel"]` (title `Hide bottom panel (Ctrl+\`)`) |
| Show chat (status bar) | `button[aria-label="Show chat"]` |
| Hide chat (status bar, when open) | `button[aria-label="Hide chat"]` (same button; `aria-pressed` reflects state) |

Extension-contributed bottom tabs use the same `:has-text("<title>")` pattern.

### Bottom — Runs tab

| Affordance | Selector |
|------------|----------|
| Empty state | `text="Trigger an agent from the floating toolbar"` |
| Run list row | child of the left column inside `RunsTab` — match by `:has-text("<agentLabel>")` |
| Per-row close | `button[aria-label="Close <agentLabel>"]` (dynamic) |
| RunView — Re-run | `button[title="Re-run"]:has-text("Re-run")` |
| RunView — Apply | `button:has-text("Apply")` (becomes `Applied` then disabled) |
| RunView — Copy (feedback / rewrite) | `button:has-text("Copy")` (multiple — scope inside the Section you care about) |
| RunView — Source toggle | text-only `button:has-text("Source (")` |
| RunView — Section heading | `h3` with `System` / `Base prompt (used for refines)` / `Response` / `Error` / `Notes` / `Summary` / `Suggested rewrite` / `Result` / `Working…` |
| RunView — Diff | `<details><summary>Show diff</summary>...</details>` — match by `summary:has-text("Show diff")` |
| RunView — Status pill | `STATUS_PILL` text: `Streaming`, `Refining`, `Done`, `Error`, `Stopped` (no aria — match by text + class) |

### Bottom — Chat tab (and the ChatPanel anywhere it renders — bottom, right dock, pop-out)

| Affordance | Selector |
|------------|----------|
| Sessions sidebar — New chat | text-only `button:has-text("New chat")` inside the 56px column |
| Session row (active flag) | `div[data-active="true"]` / `div[data-active="false"]` inside the sessions sidebar |
| Per-session busy spinner | `[data-testid="session-busy-<sessionId>"]` (dynamic) |
| Per-session pending-approvals badge | `[data-testid="session-approvals-<sessionId>"]` plus `[aria-label="<n> pending approvals"]` |
| Per-session close | `button[aria-label="Close <sessionTitle>"]` (dynamic) |
| Context-file header (active doc name) | inside the chat header — match by text content |
| Provider picker | `select[aria-label="Provider"]` |
| Model picker | `select[aria-label="Model"]` |
| Clear chat button | text-only `button:has-text("Clear")` in chat header (only when `messages.length > 0`) |
| Message list (scroll region) | `[data-testid="chat-message-list"]` (`role="log"`, `tabIndex=0`) |
| Empty-chat hint | `text="Ask anything about the document."` |
| Jump-to-latest button | `button[aria-label="Jump to latest message"]` (only when scrolled away from bottom) |
| Chat token + cost meter | `[aria-label="chat token and cost meter"]` (only renders when `messages.length > 0`) |
| Chat input | `[data-testid="chat-input"]` (textarea, placeholder `Message the document…`) |
| Send | `button[aria-label="Send message"]` (disabled until non-empty input) |
| Stop (busy state) | text-only `button:has-text("Stop")` (replaces Send + the `⏎ to send` hint) |
| Edit prompt (per user message) | `button[aria-label="Edit prompt"]` |
| Retry actions group | `[role="group"][aria-label="Retry actions"]` (sibling of last assistant bubble) |

Chat turns / bubbles:

| Affordance | Selector |
|------------|----------|
| Turn block | `[data-testid="turn-section"]` |
| Synthetic note line | `[data-testid="synthetic-note"]` |
| Turn meta line | `[data-testid="turn-meta"]` |
| Turn error line | `[data-testid="turn-error"]` |
| Chat meta line | `[data-testid="chat-meta"]` |
| Tool chip wrapper | `[data-testid="chip-root"]` |
| Tool chip result body | `[data-testid="chip-result-body"]` |
| Collapsible body | `[data-testid="collapsible-body"]` |

Todo cards (plan / tool-call lists inside chats):

| Affordance | Selector |
|------------|----------|
| Todo card root | `[data-testid="todo-card"]` |
| Todo item (per index) | `[data-testid="todo-item-<index>"]` (dynamic) |
| Todo spinner | `[data-testid="todo-spinner"]` |

Approval cards (when a tool call needs human sign-off):

| Affordance | Selector |
|------------|----------|
| Approve | text-only `button:has-text("Approve"):not(:has-text("rest"))` |
| Deny | text-only `button:has-text("Deny")` |
| Approve rest of turn | text-only `button:has-text("Approve rest of turn")` |
| MCP-tool header pill | `text="MCP"` (uppercase pill in card header) |
| Per-edit preview (apply_edits) | `<pre>` elements inside the card body — text content has `line-through` for removed lines |
| Inline diff (edit kind) | `<pre>` inside the card with `bg-emerald-900/30` (added) and `bg-red-900/30 line-through` (removed) |
| Approved / denied / cancelled flag | `text="✓ approved"` / `"✗ denied"` / `"— cancelled"` |

### Bottom — Problems tab

| Affordance | Selector |
|------------|----------|
| Scan workspace | text-only `button:has-text("Scan workspace")` (becomes `Scanning…` while running) — title `Lint every markdown file in the workspace` |
| Clear scan results | text-only `button:has-text("Clear")` — title `Clear workspace-scan results (open-tab issues stay)` |
| Empty state | `text="No problems detected."` |
| Issue row | `button` inside `section[aria-label="Bottom panel"]` with `title` = the matched span |
| Severity badge per issue | `span[aria-label="<severity>"]` where severity ∈ `error` / `warning` / `info` / `hint` |
| Per-file group heading | uppercase tracking-wide `<div>` with the relPath — match by text |

### Bottom — Output tab

| Affordance | Selector |
|------------|----------|
| Source picker (runs / chats) | `select[aria-label="Output source"]` (only when `chatAvailable`) |
| Run picker | `select[aria-label="Select run"]` (only when source=runs AND `runs.length > 0`) |
| Chat session picker | `select[aria-label="Select chat session"]` (only when source=chats AND `sessions.length > 0`) |
| Empty-runs state | `text="Run an agent from the floating toolbar"` |
| No-runs hint | `text="No runs yet."` |
| No-sessions hint | `text="No chat sessions yet."` |
| Copy prompt (runs) | text-only `button:has-text("Copy prompt")` |
| Copy response (runs) | text-only `button:has-text("Copy response")` |
| Copy all JSON (runs) | text-only `button:has-text("Copy all (JSON)")` |
| Copy session JSON (chats) | text-only `button:has-text("Copy session (JSON)")` |
| Copy transcript (chats) | text-only `button:has-text("Copy transcript")` |
| (any) "Copied" confirmation | the button text flips to `Copied` for 1.2 s after click |

### Bottom — File history tab

This is the *per-file history* panel (not the sidebar History tab).

| Affordance | Selector |
|------------|----------|
| Status badge per entry | `span[aria-label="modified"]` (the `M` marker) |
| Entry rows | no testid — match by text content (timestamp / relPath) |

## Status bar (footer)

Order, left → right (some items only render conditionally):

| Affordance | Selector |
|------------|----------|
| API-key warning button | text-only `button:has-text("⚠ No API key")` (title `No API key — click to open Settings`) — only when `apiKeyMissing` |
| Save-state indicator | text spans: `Saved` / `Unsaved` / `Saving…` / `Conflict` (no aria — match by text + colour dot) |
| Profile switcher | `button[data-testid="profile-switcher"]` (title `Click to change profile`) |
| Workspace name | text span (`title=<full path>`); remote: `span:has-text("remote")` adjacent |
| Word count | text span (`<n> words`, or `selection: <n> words`) |
| Min read | text span (`<n> min read`) |
| Token+cost meter | `span[title="Tokens · cost (this run)"]` (only when `meterTokens != null`) |
| Show / hide chat toggle | `button[aria-label="Show chat"]` / `button[aria-label="Hide chat"]` (flips; `aria-pressed` reflects state; title includes `Ctrl+\``) |
| Open Settings | `button[aria-label="Open Settings"]` |
| Footer model field (when present) | `#sidebar-footer-model` |
| Footer provider field (when present) | `#sidebar-footer-provider` |

Extension-contributed status-bar items render via `StatusBarItem`. They have no aria-label or testid — match by their text or `title=<tooltip>`. As `<button>` when `command` is defined, else `<span>`.

## Settings — rendered as an editor tab (not a sidebar tab)

Settings opens in the editor area, not the sidebar. Trigger: `button[aria-label="Open Settings"]` or palette `Settings…`. Closable like any other tab via `button[aria-label="Close Settings"]`.

| Affordance | Selector |
|------------|----------|
| Settings root heading | `h1:has-text("Settings")` |
| Settings search input | `input[type="search"][placeholder*="Search settings"]` |
| Section by id | `[data-testid="settings-section-<id>"]` |

Section IDs (`<id>` slot above) — from `SettingsTab.tsx`, in source order:

| `id` | Section title |
|------|--------------|
| `appearance` | Appearance (always first; rendered before the filtered list) |
| `provider-keys` | API keys & endpoints |
| `modes-actions` | Modes & actions |
| `agent-models` | Per-action model overrides |
| `model-pricing` | Model pricing |
| `editor` | Editor |
| `streaming` | Generation |
| `mcp-servers` | MCP servers |
| `backup` | Backup & Restore |
| `factory-reset` | Factory reset |
| `problems` | Problems |

### Settings — Appearance section

| Affordance | Selector |
|------------|----------|
| Theme radiogroup | `[role="radiogroup"][aria-label="Theme"]` |
| Theme `<label>` (each) | match by text: `:text("Dark")` / `:text("Light")` / `:text("System")` |
| Theme radio input (each) | `input[type="radio"][name="theme"][value="dark"]` / `light` / `system` (sr-only) |
| Accent swatch (per colour) | `button[aria-label="Accent <name>"]` (title = name; also has `data-accent="<hex>"`) |
| Editor font-size slider | `#appearance-font-size` |
| Chat font-size slider | `#appearance-chat-font-size` |

### Settings — other in-section affordances

| Affordance | Selector |
|------------|----------|
| Per-agent model block | `[data-testid="per-agent-model"]` |
| Model pricing input (per row) | `input[aria-label="<adapter.name> <model> input price per 1M"]` / `output price per 1M` |
| Reset pricing | `button[aria-label="reset <adapter.name> <model> pricing"]` |
| Editor: typography block | `[data-testid="typography-controls"]` |
| Generation: streaming block | `[data-testid="streaming-controls"]` |
| Generation: stream chunk delay | `[role="radiogroup"][aria-label="Stream chunk delay"]` |
| Generation: auto-scroll toggle | `[aria-label="Auto-scroll chat to latest message"]` |
| Backup / Export / Import | text-only buttons inside `[data-testid="settings-section-backup"]` |
| Factory-reset button | `button[data-testid="factory-reset-button"]` |
| Provider picker | `[aria-label="Provider"]` |
| Theme picker (alt) | `[aria-label="Theme"]` |
| Open Settings (within text) | `[aria-label="Open Settings"]` |
| Array-of-objects: Move up | `button[aria-label="Move up"]` |
| Array-of-objects: Move down | `button[aria-label="Move down"]` |
| Array-of-objects: Remove | `button[aria-label="Remove"]` |
| Anthropic API key input | `input[placeholder="sk-ant-…"]` (no aria-label; labelled by `<Field label="Anthropic API key">`) |
| OpenAI API key input | `input[placeholder="sk-…"]` (no aria-label; labelled by `<Field label="OpenAI API key">`) |
| Ollama base URL input | inside `<Field label="Ollama base URL">` — match the input by its sibling label text |
| Show / Hide key | `button:has-text("Show")` / `button:has-text("Hide")` next to the key input |

Confirm dialogs that Settings raises (`Import backup?`, `Factory reset Canv?`, `Type RESET to confirm`) use the standard `[data-testid="confirm-dialog-backdrop"]` / `[data-testid="prompt-dialog-backdrop"]`.

## Workspace-setup screen (`setup.phase === 'needs-setup'`)

| Affordance | Selector |
|------------|----------|
| Modal root | `div[role="dialog"][aria-modal="true"][aria-labelledby="canv-setup-title"]` |
| Title node | `#canv-setup-title` |
| Default-profile radio (per mode) | `input[type="radio"][name="canv-default-profile"][value="<modeId>"]` |
| Enable Revision Archaeology checkbox | `label:has-text("Enable Revision Archaeology") input[type="checkbox"]` |
| Cancel | `button:has-text("Cancel")` inside the modal |
| Set up workspace | `button:has-text("Set up workspace")` inside the modal |

## Profile picker (`first-launch` or `switch` mode)

| Affordance | Selector |
|------------|----------|
| Backdrop root | `[data-testid="profile-picker"]` |
| Profile button (per mode) | child `<button>` of the picker — no aria-label; match by visible text (e.g. `:has-text("Fiction")`) |

Switch-mode picker also exposes a cancel via clicking the backdrop (`onMouseDown` propagation handler).

## Migration modal (`canv:lastWorkspace` absent + legacy state present)

| Affordance | Selector |
|------------|----------|
| Backdrop root | `[data-testid="migration-modal-backdrop"]` |
| Dialog | `div[role="dialog"][aria-label="Welcome to Canv 0.2"]` |
| Export backup button | text-only `button:has-text("Export backup (.json)")` (becomes `Backup downloaded …`) |
| Choose workspace folder | text-only `button:has-text("Choose workspace folder")` (becomes `Setting up workspace…`) |

## Browser-unsupported banner (no `window.canvFS`)

| Affordance | Selector |
|------------|----------|
| Banner root | `[data-testid="browser-unsupported-banner"]` (`role="alert"`, `aria-label="Canv 0.2 needs the desktop app"`) |
| Export legacy backup button | text-only `button:has-text("Export legacy backup")` (only when legacy state exists) |

## Conflict dialog (file modified externally)

| Affordance | Selector |
|------------|----------|
| Backdrop root | `[data-testid="conflict-dialog-backdrop"]` |
| Dialog | `div[role="dialog"][aria-modal="true"][aria-label="File changed on disk"]` |
| Dismiss | text-only `button:has-text("Dismiss")` |
| Keep my edits | text-only `button:has-text("Keep my edits")` |
| (primary action) Discard mine | the last `button` in the dialog footer (label varies; check source for current text) |

## Document-agent instruction modal

| Affordance | Selector |
|------------|----------|
| Backdrop root | `[data-testid="agent-modal-backdrop"]` |
| Dialog | `div[role="dialog"][aria-label="Run <agent.label> on document"]` |
| Instruction input | `input[placeholder="<agent.instructionPlaceholder or 'Instruction'>"]` |

## Open Remote Workspace dialog

| Affordance | Selector |
|------------|----------|
| Dialog | `div[role="dialog"][aria-label="Open Remote Workspace"]` |
| Address input | `input[placeholder="user@host:/path/to/workspace"]` |
| Recent entry (per host) | `button` inside `<ul>` — text content is the full `user@host:/path` |
| Cancel | text-only `button:has-text("Cancel")` |
| Connect | text-only `button:has-text("Connect")` (becomes `Connecting…`) |

## Extension install modal

| Affordance | Selector |
|------------|----------|
| Backdrop root | `[data-testid="extension-install-modal-backdrop"]` |
| Dialog | `div[role="dialog"][aria-modal="true"][aria-label="Install <manifest.name>"]` |
| LanguageRed consent banner (if language ext) | `div.bg-danger-soft` containing `⚠ This extension runs code in your editor` |
| Capabilities list | `<ul>` inside the `Capabilities` section — each capability is `<li>` text |
| Network list | `<ul>` inside the `Network` section |
| Cancel | text-only `button:has-text("Cancel")` |
| Install (primary) | text-only `button:has-text("Install to this workspace")` |
| Install (danger — language ext) | text-only `button:has-text("I understand — install anyway")` |

## Extension prompt modal (quickPick or input request from extension)

Triggered via `window.canvExtensions.onPromptRequest`.

| Affordance | Selector |
|------------|----------|
| Backdrop root | `[data-testid="extension-prompt-modal-backdrop"]` |
| Dialog | `div[role="dialog"][aria-modal="true"][aria-label="Extension prompt (<extensionId>)"]` |
| Extension-id label | `text="<extensionId>"` inside the dialog header |
| QuickPick filter input | `input[type="text"][placeholder]` (placeholder = `req.placeholder ?? "Type to filter…"`) |
| QuickPick item | `<li>` inside the dialog's `<ul>` — match by visible text |
| Input form prompt | `<div>` with `req.prompt` text immediately above the input |
| Input form input | `input[type="text"]` (placeholder = `req.placeholder`) |
| Cancel | text-only `button:has-text("Cancel")` (input form only) |
| OK | text-only `button:has-text("OK")` (input form only) |

## Test extension overlay (when `canv:extensions:devFlagOn === '1'`)

The `TestExtensionOverlay` component exists in source (`src/components/extensions/TestExtensionOverlay.tsx`) but as of writing is **not mounted by any app entry** — only `*.test.tsx` files render it. The selectors below apply if/when it is wired back into `App.tsx` or `AppOverlays.tsx`.

| Affordance | Selector |
|------------|----------|
| Toggle button | `button[data-testid="test-extension-toggle"]` (`aria-label` is `Show test extension` / `Hide test extension`) |
| Notice toast (transient) | `<div>` adjacent (no testid) — match by text (`error` vs info background colour) |

## Extension contribution slots

Each slot is a placeholder `<div>` where an Electron WebContentsView is positioned by main. The slot itself is now identifiable for probes (the WebContentsView content lives in a separate document and isn't reachable through Playwright's renderer page).

| Slot | Selector |
|------|----------|
| Left-sidebar extension panel | `[data-testid="sidebar-extension-slot-ext:<extensionId>:<panelId>"]` |
| Bottom-panel extension panel | `[data-testid="bottom-extension-slot-ext:<extensionId>:<panelId>"]` |
| Extension editor tab | `[data-testid="extension-editor-tab-<extensionId>"]` with `data-relpath="<relPath>"` |

Status-bar extension items: see Status bar section above.

## Toasts and inline notifications (rendered by `AppOverlays`)

| Affordance | Selector |
|------------|----------|
| Generic toast | `[data-testid="toast"]` (`role="status"`, `aria-live="polite"`) — auto-dismisses in 3 s |
| Retry-undo toast | `[data-testid="retry-undo-toast"]` — auto-dismisses in 10 s |
| Retry-undo "Undo" button | `button[aria-label="Undo retry"]` |

## Dialogs (`useDialogs` API: prompt + confirm)

| Surface | Selector |
|---------|----------|
| Prompt dialog backdrop | `[data-testid="prompt-dialog-backdrop"]` |
| Prompt dialog | `div[role="dialog"][aria-label="<title>"]` (dynamic) |
| Confirm dialog backdrop | `[data-testid="confirm-dialog-backdrop"]` |
| Confirm dialog | `div[role="dialog"][aria-label="<title or 'Confirm'>"]` |

Dialog buttons (both Prompt and Confirm): `button:has-text("OK")` / `button:has-text("Cancel")` — or whatever `submitLabel` / `cancelLabel` was passed. Confirm dialog auto-focuses its primary button. Escape cancels both via a document listener.

Known `submitLabel` overrides (from source, verified by probe): file-tree **New file** and **New folder** prompts use `button:has-text("Create")` (`useWorkspaceFileOps.ts`); Settings factory-reset confirmation uses `Erase`. Don't assume `OK`.

## Pop-out dock window (separate Electron window)

When the user pops out the dock, a second BrowserWindow opens with `DockPopoutBoot`. Playwright sees it as another `page` on the same `ElectronApplication` — filter by URL prefix (`http://localhost:5173/popout` or similar in dev).

| Affordance | Selector inside the pop-out |
|------------|------------------------------|
| Bottom panel | `section[role="region"][aria-label="Bottom panel"]` (same as main) |
| Tab headers | same `:has-text("Runs")` / `Chat` / `Problems` etc. pattern |

To enumerate windows: `app.windows().filter((w) => w.url().includes('5173'))` — main vs pop-out differ by path; if they're indistinguishable by URL, check `await win.evaluate(() => !!document.querySelector('header[role="banner"]'))` — only the main window renders the topbar.

## Selector-strategy notes

- **`:has-text()` and `:text()` are Playwright-only.** They work in `win.click(sel)`, `win.locator(sel)`, `win.waitForSelector(sel)`, `win.$(sel)`. They do **NOT** work inside `document.querySelector(sel)` you pass to `win.evaluate()` — the browser raises `SyntaxError: not a valid selector`. Inside `evaluate`, use plain CSS or iterate manually:

  ```js
  // In win.evaluate() — text match by iteration:
  [...document.querySelectorAll('section[aria-label="Bottom panel"] button')]
    .find((b) => b.textContent?.trim() === 'Runs')?.click()
  ```

- **Prefer aria-label over text** when both exist — aria-label survives i18n and copy changes.
- **Container-scoped queries beat global ones.** `section[aria-label="Bottom panel"] button:has-text("Runs")` won't collide with an unrelated "Runs" elsewhere.
- **Auto-IDs to ignore:** `_r_<hex>_` (React Aria), `radix-*` (Radix). These rotate per render.
- **SVG decoration IDs to ignore:** `g1`, `g2` here are split-group panel IDs (not SVG defs — actually load-bearing). Real SVG defs are unlabelled gradient elements inside the brand logo.
- **Dynamic aria-labels:** anything that includes a relPath, session title, snapshot id, heading text, status name, agent label, adapter name, model name, extension id. Build the selector at probe time from the data you expect.
- **Portals**: command-palette dropdown, dialogs, file-tree context menu render into `document.body`, not their parent component. Query globally for those.
- **Conditional renders.** Many selectors only resolve when the underlying state exists. Common cases (verified empirically):

  | Selector | Renders when |
  |----------|--------------|
  | `#sidebarOutline`, `[role="tree"][aria-label="Document outline-solid"]` | An active document with parseable headings is open |
  | `button[aria-label="Pop out dock"]` | Bottom panel is visible AND `isElectron() === true` (not a popover — always rendered in the bottom-panel header) |
  | `#bottom` | `dockPlacement === 'bottom'` |
  | `#dockRight` | `dockPlacement === 'right'` |
  | `[aria-label="chat token and cost meter"]` | Chat tab active AND `messages.length > 0` |
  | `select[aria-label="Output source"]` | `chatAvailable === true` in the Output tab |
  | `select[aria-label="Select run"]` | source=`runs` AND `runs.length > 0` |
  | `select[aria-label="Select chat session"]` | source=`chats` AND `sessions.length > 0` |
  | `section[aria-label="Bottom panel"]` | Bottom panel is open (toggle via `[aria-label="Show chat"]`) |
  | `button[data-testid="document-agent-menu-trigger"]` | Always present, but disabled when no doc is open |
  | `button[aria-label="History"]` (activity bar) | `setup.config.revisionArchaeology.enabled === true` |
  | `[data-testid="floating-toolbar"]` | A text selection exists in the editor |
  | `[data-testid="profile-picker"]` | First launch, or profile id not yet set in localStorage |
  | `[data-testid="conflict-dialog-backdrop"]` | A `workspace.conflict` is pending (external write detected) |
  | `[data-testid="migration-modal-backdrop"]` | Triggered via `setMigrationOpen(true)` (e.g. legacy backup flow) |
  | `[data-testid="browser-unsupported-banner"]` | `window.canvFS` absent (browser preview only) |
  | `[data-testid="extension-install-modal-backdrop"]` | User picked Install from folder / .canvext |
  | `[data-testid="extension-prompt-modal-backdrop"]` | Extension called `quickPick` / `input` |
  | `[data-testid="test-extension-toggle"]` | `localStorage["canv:extensions:devFlagOn"] === "1"` |
  | `[data-testid="toast"]` | `notifications.showToast(...)` fired within last 3 s |
  | `[data-testid="retry-undo-toast"]` | `notifications.showRetryUndoToast(...)` fired within last 10 s |

- **When in doubt**, dump the inventory yourself with the snippet below and update this file.

```js
// Selector inventory snippet — runs in win.evaluate.
const isAutoId = (s) => !s || /^_r_[a-z0-9]+_$/i.test(s) || /^radix-/i.test(s)
const els = [...document.querySelectorAll('[aria-label],[role],[data-testid],[id]')]
return els.map((el) => ({
  tag: el.tagName.toLowerCase(),
  id: isAutoId(el.id) ? null : el.id,
  aria: el.getAttribute('aria-label'),
  role: el.getAttribute('role'),
  testid: el.getAttribute('data-testid'),
  title: el.getAttribute('title'),
  text: (el.textContent || '').trim().slice(0, 60) || null,
})).filter((r) => r.id || r.aria || r.role || r.testid)
```

## Driving the app into useful states

Most surfaces only render once you've put the app in the right state. Recipes:

```js
// Seed a real workspace + profile so the picker doesn't block startup.
// Run BEFORE win.reload() inside a launchCanv call:
await win.addInitScript((ws) => {
  try {
    localStorage.setItem('canv:lastWorkspace', ws)
    if (!localStorage.getItem('canv:profile')) localStorage.setItem('canv:profile', 'fiction')
  } catch {}
}, '/home/zabouth/CanvDemo')

// Dismiss the profile picker if it appears anyway.
const pickerOpen = await win.evaluate(() => !!document.querySelector('[data-testid="profile-picker"]'))
if (pickerOpen) {
  await win.evaluate(() => document.querySelector('[data-testid="profile-picker"] button')?.click())
  await win.waitForTimeout(400)
}

// Open the bottom panel before clicking its tabs.
await win.evaluate(() => document.querySelector('button[aria-label="Show chat"]')?.click())

// Open Settings as an editor tab.
await win.click('button[aria-label="Open Settings"]')

// Open a file with headings so the outline pane mounts. Files in the tree
// are <div>s — Playwright's text selector handles them:
await win.click('#sidebarFiles >> text=README.md')

// Trigger a generic toast (when you want to assert toast UX without firing
// a real flow). Dispatch a custom event the chat service exposes, or call
// the hook directly from within a unit test — production code raises toasts
// from useNotifications.showToast(), which probes can't call directly. The
// cleanest path is to drive a real action that produces a toast (e.g. apply
// a run with no selection: `Select some text first`).

// Enable the test-extension overlay:
await win.evaluate(() => localStorage.setItem('canv:extensions:devFlagOn', '1'))
// (then reload; on next mount TestExtensionOverlay renders.)
```

## Updating this file

If your probe found a selector not listed here, or a row that's wrong (e.g. the aria-label was renamed in source), **fix it before closing out the task**. The skill is only useful if it stays accurate. Add new rows under the region that owns them; if a region doesn't exist yet, add a new `## <Region>` heading in document order (top bar → activity bar → sidebar → editor → bottom → status → settings → setup → modals → banners → toasts).
