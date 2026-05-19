# Canv improvement plan

## Context

A review of the codebase surfaced four classes of work: silent correctness bugs that will eventually hit users, structural debt that causes specific files (`App.tsx`, `electron/main.cjs`) to regrow after every cleanup, extension-system gaps that will bite during distribution, and testing/observability gaps that let regressions land unnoticed.

Notes on environment that affect the plan:
- **Native only.** Canv is Electron — no browser target. The testing item below uses Playwright's native Electron API (`_electron.launch`), not the browser context.
- **Extension authoring lives outside the app.** The Builder has been removed; extension authoring now happens via an external Claude skill. The plan below assumes Canv only consumes finished extensions, and that anything an authoring assistant needs (library inspection, npm fetching, bundling) lives in the skill, not in Canv.

The plan below is the action list, ordered by impact. Each item lists what to change, where in the code, why, and a concrete "done when" check.

## Order and rationale

1. **P0 correctness bugs first.** EOL/encoding loss, the keystroke allocation, and the missing large-file guard are silent — they don't surface until a user has lost data or seen lag. Fix while the context is fresh.
2. **The two structural changes next** (`ServicesContext` + `main.cjs` split). Every subsequent feature benefits, and these are the changes that stop `App.tsx` and `main.cjs` regrowing after cleanups. Doing them before the extension and settings work means each later item lands in cleaner shape.
3. **Extension system hardening + MCP** after the structural work, so the extension code lives in its own service module not in monolithic `main.cjs`.
4. **Settings hardening** in parallel; small surface, low risk.
5. **Testing infrastructure** runs continuously alongside everything else.
6. **Deferred items** documented but not scheduled.

---

## P0 — silent correctness (fix this quarter)

### 1. Preserve EOL on save

**What.** On read, detect the line-ending style of the file (`\r\n` vs `\n`) and store it on the open-tab record. On save, re-encode to the original style. New files use the OS default.

**Where.**
- `electron/main.cjs` — the `canvFS:readFile` handler (returns the raw text today; needs to also return the detected EOL).
- `src/hooks/useWorkspace.ts` — extend the open-tab record with `eol: '\r\n' | '\n'`; thread through `saveTab` (`:198`).
- `electron/main.cjs` — the `canvFS:writeFile` handler accepts the EOL and re-encodes before write.

**Why.** Without this, opening a CRLF file from a Windows collaborator and saving silently flips every line to LF — their next git pull shows the whole file changed.

**Done when.** Round-trip test in `electron/canvfs.test.cjs` (new): write a known CRLF file, open via the IPC handler, modify one character, save, re-read raw bytes — bytes equal except the modified character.

### 2. Preserve encoding on save (BOM at minimum)

**What.** Detect UTF-8 BOM on read; carry on the open-tab record; restore on write. For non-UTF-8 inputs (rare but real for old `.txt` notes imported into a vault), surface "encoding not supported, save as UTF-8 will lose data" rather than silently mojibaking.

**Where.** Same two files as #1. Encoding goes on the same open-tab record alongside EOL.

**Why.** UTF-8 BOM stripped on save corrupts files that some Windows tooling still requires. Mojibake from undetected non-UTF-8 input is unrecoverable silent damage.

**Done when.** Same round-trip test as #1, also covers BOM. Plus a test that opening a Windows-1252 file produces a visible warning and refuses to overwrite silently.

### 3. Live-buffer keystroke allocation

**What.** The live-buffer mirror (`useEditorRegistry.ts:60`, `:183–186`) calls `state.doc.toString()` and overwrites a `Map<key, string>` entry on every `docChange` event. On a 2 MB markdown doc this allocates 2 MB and adds GC pressure per keystroke.

Two refactor options — pick one:
- **(A) Lazy materialisation.** Don't mirror at all. Have subscribers call `getView(key).state.doc.toString()` on demand. The keystroke event becomes a notification, not a payload.
- **(B) Diff-based.** Subscribe to CodeMirror transactions and push `ChangeSet` deltas instead of full text. CM 6 gives you `tr.changes` for free; subscribers reconstruct.

Pick (A) unless a subscriber actually needs to keep its own copy of the text — most listeners only care that "something changed".

**Where.**
- `src/hooks/useEditorRegistry.ts:56` (the Map declaration), `:60` (the update site), `:183–186` (the publish path).
- Audit subscribers of the live-buffer publish event (grep for the channel name) — they may need to switch from receiving the string to pulling it.

**Why.** This is the single largest avoidable perf cost in the editor loop. Markdown files in a writing vault can easily hit several MB (research dumps, embedded base64, long-form drafts).

**Done when.** New Vitest benchmark in `src/hooks/useEditorRegistry.bench.ts`: load a synthetic 2 MB markdown doc, run 1000 simulated keystrokes through the pipeline. Assert p99 keystroke latency < 5 ms and that peak resident memory growth is bounded (not proportional to doc size × keystroke count). Pair with #17.

### 4. Large-file guard on open

**What.** Reject files >25 MB from the markdown editor path. Open them in a read-only viewer instead (or refuse with a clear message). Same threshold for "open file" and "open as part of workspace scan".

**Where.**
- `electron/main.cjs` — the `canvFS:readFile` handler returns size + a flag if over threshold (no read).
- `src/hooks/useWorkspace.ts` — `openTab` honours the flag and routes to a viewer or notification instead of mounting the CM6 editor.

**Why.** A stray multi-GB log file dragged into the vault will lock the renderer reading it into a string buffer. The user has no way to recover without killing the process.

**Done when.** Test: drop a synthetic 50 MB file in a test workspace, attempt to open via the IPC handler — the CM6 editor must not mount.

---

## P1 — structural changes that stop recurring debt

### 5. Typed `ServicesContext` + self-registering features  *(this is the cornerstone item)*

**What.** Replace the current "all hooks called in App.tsx and threaded through" pattern with:

1. **A typed service registry.** Define `interface ICanvServices { workspace: IWorkspaceService; settings: ISettingsService; commands: ICommandsService; dialogs: IDialogsService; ... }` with one entry per existing hook-as-service.
2. **A `<ServicesProvider>` component.** Calls each hook exactly once (preserving today's single-instance semantics), packages the return values into the typed map, exposes via React Context.
3. **A `useService(key)` accessor.** `const ws = useService('workspace')` returns `IWorkspaceService` with full type inference. Components and hooks pull their own dependencies — no more prop-drilling through App.tsx.
4. **A contribution mechanism.** Define `interface Contribution { register(services: ICanvServices): Disposable }`. Create `src/contributions/` with one file per feature area (commands, theme effects, ollama refresh, system-theme-listener, file-ops, selection-agent, dock-bridge, idle-snapshot, etc.). A small `loadContributions(services)` iterates a `contributions` array and calls each `register()`.
5. **Shrink App.tsx** to: providers, the shell render, and `<Contributions />` (or an equivalent effect that calls `loadContributions` once). New features add a file in `contributions/`, not a line in App.tsx.

**Where.**
- New: `src/services/index.ts` — the `ICanvServices` interface and the `ServicesContext`.
- New: `src/services/ServicesProvider.tsx` — calls every hook, builds the map, provides context.
- New: `src/services/useService.ts` — the typed accessor.
- New: `src/contributions/` — one file per current cross-cutting concern. Initially populated by moving today's App.tsx effects:
  - `src/contributions/theme.contribution.ts` — accent + theme application + system listener
  - `src/contributions/ollama.contribution.ts` — the refresh effect
  - `src/contributions/commands.contribution.ts` — what `useAppCommands` does today, broken into per-feature `register()` calls
  - `src/contributions/dock-bridge.contribution.ts`, `src/contributions/idle-snapshot.contribution.ts`, etc.
- Modify: `src/App.tsx` — shrink from 792 LOC to roughly 100–150. Keeps the JSX shell and the providers; everything else moves out.
- Modify: every consumer that currently receives props from App.tsx — switch to `useService(...)` inside its own body. The mechanical change is small per call site.

**Why.** App.tsx has regressed to 792 LOC despite a recent cleanup. The cause is structural: every cross-cutting feature needs access to multiple hook return values, and the only place those exist is App.tsx — so every feature lands here. A cleanup that extracts logic into helpers still leaves the *call* + *wiring* in App.tsx. The only way to stop the regrowth is to make features pull their own dependencies (`useService`) and register themselves (contributions), so the natural path of least resistance no longer ends at App.tsx.

**Done when.**
- `wc -l src/App.tsx` ≤ 150.
- Adding a new command to the palette touches zero lines in App.tsx (verified by trial: create a new `src/contributions/example.contribution.ts`, see the command appear).
- `useService('workspace')` typechecks and returns the expected interface.
- All existing functionality still works (the existing Vitest suite + manual smoke through the dev build).

### 6. Split `electron/main.cjs` by domain

**What.** Break the 79.9 KB monolith with 40+ `ipcMain.handle` calls into per-domain service modules. Each module owns its primitives and its IPC surface.

Target shape:
```
electron/
  main.cjs                          # ~150 lines: app lifecycle, window creation, wire services
  services/
    fs/index.cjs                    # canvFS:* handlers, EOL/encoding helpers from #1/#2
    git/index.cjs                   # git operations + isomorphic-git wrappers
    ssh/index.cjs                   # remote workspace + SSH
    history/index.cjs               # canvHistory:* handlers
    extensions/index.cjs            # delegates to existing electron/extensions/* modules
    workspace/index.cjs             # workspace lifecycle, trust, config
    serve/index.cjs                 # the existing canvServe:* handlers
    sites/index.cjs                 # canvSites:* handlers
    dock/index.cjs                  # canvDock:* handlers
```

Each module exports `registerIpcHandlers(ipcMain, deps)`. `main.cjs` becomes a wirer that imports each service and calls its register function in order.

**Where.** As above. Move handlers function by function; behaviour stays identical. Keep the chokidar watcher in `services/fs/index.cjs` for now (don't move to a utility process yet — that's deferred).

**Why.** Today every change touches `main.cjs`, every code review scrolls through unrelated handlers, and "where does X live" is non-obvious. Splitting eliminates the monolith without changing behaviour.

**Done when.**
- `wc -l electron/main.cjs` < 500 (target 150–250).
- Every existing IPC test still passes.
- No handler is registered in more than one file.

### 7. `IDisposable` + `DisposableStore` utility

**What.** A small lifecycle utility (around 30–60 LOC) used by services and contributions to manage subscriptions, watchers, and event listeners. Replaces ad-hoc `useEffect` cleanups inside services with explicit `register(d: Disposable)` + a single `dispose()` that tears down a whole subtree.

Sketch of the API:
```ts
interface Disposable { dispose(): void }
class DisposableStore implements Disposable {
  add<T extends Disposable>(d: T): T
  dispose(): void   // disposes all, idempotent
}
function toDisposable(fn: () => void): Disposable
```

**Where.**
- New: `src/lib/lifecycle.ts` — the implementation.
- Adopt incrementally: each new contribution's `register()` returns a `Disposable`. Long-lived hooks that today return cleanup functions in `useEffect` can wrap their disposers in a `DisposableStore`.

**Why.** Contributions (#5) need a clean lifecycle contract — `register(services): Disposable` and a single `dispose()` to tear down. Without this, contributions accumulate ad-hoc cleanup code and the lifecycle of the registration graph becomes unclear.

**Done when.** `src/lib/lifecycle.ts` exists, has unit tests (`src/lib/lifecycle.test.ts`), and is used by at least one contribution and the contribution loader itself.

### 8. Atomic `applyEdits(edits[])` operation

**What.** A single workspace-level operation that applies a list of file edits atomically (best-effort: either all succeed or all roll back). Each edit specifies file, range (or insert position), new text. Returns a result the UI can display as a single undo step.

Sketch:
```ts
type FileEdit = { relPath: string; range?: [number, number]; text: string }
async function applyEdits(edits: FileEdit[]): Promise<EditResult>
```

**Where.**
- New: `src/services/workspaceEdits.ts` (or extend `IWorkspaceService` with `applyEdits`).
- Implementation flows through the FS service (`electron/services/fs/index.cjs` after #6) using a transaction-style write: stage all changes, validate, commit. Rollback on failure restores from a per-edit snapshot.
- Consumed by the in-app chat (when an AI suggests multi-file edits) and any future tool surface that proposes file changes.

**Why.** Multi-file rewrites (rename, refactor across linked notes, multi-file edits suggested by chat) need to be a single reviewable operation, not N independent saves. Today there is no primitive for this; every caller would invent its own ad-hoc loop.

**Done when.** A test that calls `applyEdits([...])` across three files, deliberately fails the third write, and asserts the first two were rolled back. UI integration deferred — primitive must exist first.

---

## P1 — extension system improvements

### 9. Add `engines.canv` (or `apiVersion`) to manifest schema

**What.** Extend the manifest Zod schema (`electron/extensions/manifest-schema.cjs:120–124`) with a required `engines.canv: <semver-range>` field. The host enforces compatibility at install/activation time: if the running Canv version does not satisfy the range, refuse to load with a clear message.

Also introduce a single `CANV_API_VERSION` constant in the host (`electron/extensions/api-version.cjs`, new) and bump it whenever a breaking change to the extension preload API is made.

**Where.**
- Modify: `electron/extensions/manifest-schema.cjs` — add the field.
- New: `electron/extensions/api-version.cjs` — the constant.
- Modify: `electron/extensions/runtime.cjs` — check on load; fail loudly with a notification.
- Update each example/test fixture extension manifest under `electron/extensions/test-fixtures/` (or wherever the fixtures live) with the new field.

**Why.** No version pinning today means a future breaking host change silently mis-loads every old extension. Cheap forward-compat insurance, cheapest now while there are few extensions to migrate.

**Done when.** Installing an extension whose `engines.canv` does not match fails with a visible error. Existing fixtures all have the field. Unit test in `electron/extensions/manifest-schema.test.cjs` covers the check.

### 10. Make the install flow pre-bundled-first

**What.** With Builder removed, the install flow no longer has an in-app reason to fetch from jsdelivr/esm.sh at install time. The Claude skill produces finished extensions (vendoring + bundling happen during authoring, externally). The Canv install path should:

- Accept either an unpacked folder (for local dev) or a packaged `.canvext` zip (for distribution).
- Validate the manifest, vendor hashes, and disclose licenses exactly as today.
- **No CDN fetch at install time.** If a manifest references a `vendor/` entry that isn't physically present, the install fails clearly — it does not try to download it.

Audit and remove (or feature-flag off) any code in `electron/main.cjs:1543–1598` (before the #6 split) that fetches packages at install time. Keep the inspection helpers (`library-inspect.cjs` if it's used by anything still in the app) only if they have a runtime caller; otherwise delete.

**Where.**
- Modify: the install flow (`electron/main.cjs:1543–1598` before the split; `electron/services/extensions/index.cjs` after #6).
- Audit: `electron/library-inspect.cjs`, `electron/library-fetch.cjs` (or equivalent) — delete what's now unreachable.
- New: a small `scripts/pack-extension.mjs` that takes an unpacked extension directory and produces a `.canvext` zip with the vendor/ already populated and hashes embedded. The Claude skill calls this (or duplicates the logic) at the end of an authoring session.

**Why.** With Builder gone, the live-fetch install path has no caller in Canv itself. Keeping it as dead code is a security/maintenance liability (it's a network-fetching, code-executing path). Removing it simplifies the install flow and locks in the deterministic install contract.

**Done when.** Installing a `.canvext` succeeds with the network disconnected. Installing an extension whose manifest references a missing `vendor/` entry fails with a clear error rather than attempting to fetch. No code in `electron/services/extensions/` performs HTTP at install time.

### 11. Add `workspaceContains:` and `onUri:` activation events

**What.** Two new activation event types in `electron/extensions/activation-events.cjs:3–27`:
- `workspaceContains:<glob>` — activate when the vault contains at least one file matching the glob.
- `onUri:canv://<id>/<path>` — activate when a custom URI is dispatched (deep-linking).

**Where.**
- Modify: `electron/extensions/activation-events.cjs` — add the two cases.
- Modify: the activation trigger surface in `electron/extensions/runtime.cjs` so workspace-scan completion and URI dispatch fire the right activation.
- Document the new events alongside the existing list (inline doc comment is enough).

**Why.** Today extensions that only matter when the vault has a specific structure (e.g. a daily-notes folder) must use `onStartup` and pay the cost of always loading. URI activation lets external tools or other extensions deep-link into a specific extension's UI without a separate command.

**Done when.** Test: a fixture extension declares `workspaceContains:daily-notes/*.md`; opening a vault without that folder doesn't spawn the WebContentsView; adding a file matching the glob triggers activation.

### 12. MCP client support (host-side, capability-gated for extensions)

**What.** Add a Model Context Protocol client in the Electron main process. Two consumers:

1. **The in-app chat** can call MCP tools as part of an assistant turn (configured via settings — list of MCP server endpoints to connect to per workspace).
2. **Extensions** can call MCP tools through a new gated capability `mcp.call` that proxies through the host, preserving the existing capability + manifest validation pipeline. Extensions declare a `mcp.tools: string[]` allowlist in their manifest.

Scope of v1:
- One or more MCP server connections per workspace, configured in settings.
- `tools/list` + `tools/call` only. No prompts/resources surface in v1.
- All extension calls require the `mcp.call` capability + the specific tool name on the extension's manifest allowlist.

**Where.**
- New: `electron/services/mcp/index.cjs` (after #6) — the client, connection management, capability enforcement.
- Modify: `electron/extensions/manifest-schema.cjs` — accept the new capability and a `mcp.tools: string[]` allowlist field.
- Modify: `electron/extensions/extension-preload.cjs` — expose `canv.mcp.call(tool, args)` when the capability is granted; route through the host MCP client.
- Modify: the in-app chat / adapter layer (`src/adapters/*`, `src/components/ChatPanel.tsx`) — surface MCP tools as available tools the model can call.
- Modify: settings (`src/hooks/useSettings.ts`) — add `mcpServers: McpServerConfig[]`.

**Why.** MCP is now table stakes for the AI-editor category. The npm SDK (`@modelcontextprotocol/sdk`) is small (~3.5 KB minified for the client) and fits cleanly in the existing capability-gated architecture. Routing extension calls through the host preserves the sandbox/capability story instead of letting extensions speak MCP directly.

**Done when.** In-app chat can list and call tools from a configured MCP server. A test fixture extension with `mcp.call` capability can invoke one allowlisted tool and gets its result; without the capability the call is rejected.

---

## P1 — settings hardening

### 13. Zod-parse settings on load

**What.** Define a Zod schema for the `Settings` interface (`src/hooks/useSettings.ts:1–90`). Run `Schema.parse(JSON.parse(localStorage.getItem('canv:settings')))` on load. Catch corrupted/legacy state and fall back to defaults with a notification rather than silently using a broken object.

Use the same schema as the source of truth for an auto-generated settings UI in a later phase: annotate fields with `.describe()` so a future panel can render labels and tooltips from the schema.

**Where.**
- New: `src/hooks/settingsSchema.ts` — the Zod schema.
- Modify: `src/hooks/useSettings.ts` — parse on load, handle the failure path.

**Why.** Today an old/corrupt blob silently feeds garbage into the rest of the app and is hard to diagnose. Validation gives an explicit failure point and a recovery path. Setting up the schema now also unlocks the auto-generated settings UI later.

**Done when.** Test: write a deliberately broken JSON blob to `localStorage['canv:settings']`, boot the app, verify the user sees a notification and the app falls back to defaults rather than crashing on a missing field.

### 14. Plan on-disk vault settings path (design only)

**What.** Write a short design note (inline in `src/hooks/useSettings.ts` as a comment block, or a sibling `.notes.md` if you prefer) describing the planned three-layer settings merge: app defaults → user (localStorage) → vault (`<vault>/.canv/settings.json`). Don't ship yet — just lock the merge semantics and key namespace before behaviour drifts.

**Where.** `src/hooks/useSettings.ts` — comment block at the top, or a short `src/hooks/settings.design.md`.

**Why.** Power-user vaults will want overrides committed to the vault (theme, font, accent, per-vault model). Writing this down now prevents you from designing yourself into a corner with the current localStorage shape.

**Done when.** The design note exists and answers: which keys are user-scoped vs vault-scoped, what wins on conflict, where the vault file lives, how it's watched for external edits, how it's surfaced in the UI.

---

## P2 — testing infrastructure (run continuously)

### 15. IPC handler integration tests

**What.** Every `ipcMain.handle(...)` registration gets one happy-path test and one error-path test. Tests run against the real handler with a mocked filesystem + a real Electron `ipcMain` instance from `electron-mock-ipc` (or a hand-rolled stub).

**Where.**
- After #6 (the `main.cjs` split), each `electron/services/*/index.cjs` gets a sibling `*.test.cjs`.
- Wire into the existing Vitest config (or a separate Vitest project for the CJS files).

**Why.** Almost every Canv bug crosses an IPC boundary. The IPC layer is the highest-leverage place to test. Unit tests on individual hooks miss the wire-format and schema-validation issues that actually break things in production.

**Done when.** Every `ipcMain.handle` has at least one happy + one error test. CI runs the suite; coverage report exists.

### 16. Playwright Electron smoke test  *(native Electron API, not browser)*

**What.** A ~5-minute Playwright suite that boots the packaged Electron app and exercises critical flows: open workspace, create note, type, save, activate a test-fixture extension, open command palette, run a command, quit.

**Implementation specifics** — Canv is native, no browser target, so use Playwright's Electron API directly:

```ts
import { test, _electron as electron } from '@playwright/test'

test('boot and edit', async () => {
  const app = await electron.launch({
    args: ['./dist-electron/main.cjs'],  // or whatever the built entry is
  })
  const window = await app.firstWindow()
  await window.waitForSelector('[data-test="workspace-shell"]')
  // … drive the window like a normal Playwright Page
  await app.close()
})
```

Do **not** use `chromium.launch()` or `browser.newPage()` — the app cannot run in a vanilla Chromium without the Electron main process providing the IPC surface.

**Where.**
- New: `tests/smoke/` directory.
- New: `playwright.config.ts` configured for a single Electron-project target (no browsers).
- New: GitHub Actions (or whichever CI is in use) workflow that builds the app via `npm run electron:build` and runs the smoke suite against the built artefact. Linux primary; macOS + Windows when CI capacity allows.

**Why.** Whole categories of regressions are invisible to unit tests: preload script broken, custom protocol handler broken, window won't open, `contextBridge` surface dropped a method, an extension's `WebContentsView` fails to mount. Five minutes of smoke catches most of these. The Electron-API form means the test exercises the real preload + main process, not a stripped-down browser context.

**Done when.** The suite passes locally and in CI on at least Linux against the production-built app. Failing the smoke suite blocks merge to main.

### 17. Keystroke-latency benchmark

**What.** A Vitest benchmark (`src/hooks/useEditorRegistry.bench.ts`) that loads a synthetic 2 MB markdown doc, runs 1000 simulated keystrokes through the live-buffer pipeline, and asserts a p99 budget. Fail the build on regression.

**Where.**
- New: the benchmark file.
- Modify: CI config to run benchmarks on every PR touching `src/hooks/useEditorRegistry.ts` or `src/lib/cm/`.

**Why.** Pairs with #3. Without this benchmark, the keystroke loop can silently regress to its current state again. Locking in the perf budget makes the regression a CI failure, not a user complaint.

**Done when.** The benchmark runs in CI and fails the build if p99 > 5 ms on a fixed-size input.

---

## P3 — deferred (track but don't schedule)

- **Notes-vault features (backlinks, link graph, tag index).** Product-direction question, not a debt-reduction item.
- **ripgrep integration for search.** Measure JS-side search on a 5K-note vault first; switch only if slow.
- **File-watcher + search in a Node utility process.** Move out of main-process if main-loop responsiveness regresses.
- **Extension-to-extension API** (an extension calling another's exports). Defer until a concrete use case shows up.
- **Auto-generated settings UI from the Zod schema** (uses #13 as foundation).
- **Workspace edits surfaced as a single UI undo step.** Builds on #8 once consumers exist.

---

## Suggested execution order

Roughly one focused dev, calendar-week estimates:

1. **Week 1 — P0 correctness.** Items #1, #2, #3, #4. All four are localised. Ship them as one PR or four small PRs; each has its own round-trip test.
2. **Weeks 2–3 — The structural fix.** Item #5 (`ServicesContext` + contributions) and #7 (`Disposable`). Both land in one branch; tests must keep passing throughout. This is the change that stops App.tsx regrowing.
3. **Week 4 — Main split.** Item #6. Pure refactor; the IPC integration tests in #15 should land in parallel so the split has a safety net.
4. **Weeks 5–6 — Extensions.** Items #9, #10, #11. Item #12 (MCP) can come here or be deferred depending on user pull.
5. **Ongoing.** Items #15, #16, #17 land continuously — each new feature should leave the testing surface no worse than it found it.
6. **Quick wins anywhere.** #8, #13, #14 are low-effort and can slot into any week.

Total effort estimate: 5–7 focused weeks for P0 + P1. Most of the value lands in weeks 1–3 (P0 + the structural fix).

---

## Verification summary

| # | Item | "Done when" check |
|---|------|--------------------|
| 1 | EOL preservation | Round-trip test in `electron/canvfs.test.cjs` |
| 2 | Encoding preservation | Same round-trip test, BOM case |
| 3 | Keystroke allocation | `useEditorRegistry.bench.ts` p99 < 5 ms |
| 4 | Large-file guard | 50 MB file does not mount the CM6 editor |
| 5 | ServicesContext + contributions | `wc -l src/App.tsx` ≤ 150, new feature touches zero App.tsx lines |
| 6 | `main.cjs` split | `wc -l electron/main.cjs` < 500, all IPC tests pass |
| 7 | Disposable utility | `src/lib/lifecycle.ts` + tests + at least one consumer |
| 8 | `applyEdits` | Three-file edit with a forced failure rolls back the first two |
| 9 | `engines.canv` | Mismatched version refuses to load with a visible error |
| 10 | Pre-bundled-first install | `.canvext` installs offline; missing `vendor/` fails clearly; no HTTP at install time |
| 11 | Activation events | `workspaceContains:` fires correctly; `onUri:` deep-link works |
| 12 | MCP support | In-app chat lists and calls MCP tools; capability gating blocks unauthorised extensions |
| 13 | Zod settings parse | Corrupted `canv:settings` triggers fallback with a notification |
| 14 | Vault settings design | Design note exists and is internally consistent |
| 15 | IPC integration tests | Every `ipcMain.handle` has happy + error coverage |
| 16 | Playwright Electron smoke | Suite passes in CI on Linux against the built app via `_electron.launch` |
| 17 | Keystroke benchmark | CI fails on regression past the p99 budget |
