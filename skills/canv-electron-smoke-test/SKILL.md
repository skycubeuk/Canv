---
name: canv-electron-smoke-test
description: Use when verifying or debugging behavior that only manifests in the running Electron app — title-bar / window-control overlay, mount-time focus, keyboard shortcuts that depend on real focus state, devtools-detach interactions, dropdown anchoring, drag regions. Drives the dev build via `playwright._electron.launch`, captures DOM probes, focus history, and screenshots. Triggers on "verify this in the real app", "drive the Electron app", "smoke test this UI change", or any task where vitest cannot reproduce the symptom because the bug is renderer / Electron-shell specific.
---

# Canv Electron smoke test

You are about to drive the running Electron app to verify behavior that doesn't reproduce in vitest. vitest tests render React into jsdom — they miss everything that depends on the Electron shell: `titleBarStyle`, `titleBarOverlay`, detached devtools, window-level focus, drag regions, the Vite-served renderer plus Electron's preload bridge.

## When to use this skill

Use when ANY of these is true:
- The user reports a bug that only happens in the desktop app
- You're changing the topbar / chrome / `titleBarStyle` / `titleBarOverlay`
- You're changing focus management, keyboard shortcuts, or anything that interacts with `document.activeElement`
- You're changing drag regions (`-webkit-app-region`)
- You need to confirm a fix actually works in the real app, not just in unit tests
- You're investigating a reported bug whose root cause you can't pin down by reading code alone

Do **not** use for pure logic changes that vitest already covers. The browser-only Vite preview at `http://localhost:5173` is gated by `BrowserUnsupportedBanner` because `window.canvFS` is missing — driving the renderer through a vanilla browser won't render the app.

## Prerequisites

Verify before you write the probe script:

```bash
# 1. Vite must be reachable on the dev URL. If not, start it.
curl -fs -o /dev/null http://localhost:5173/ && echo "vite up" || npm run dev &

# 2. Playwright must be installed in the project. If not, install it
#    locally (no-save: the dep doesn't belong in package.json).
ls node_modules/playwright >/dev/null 2>&1 || npm install --no-save playwright
```

Run the probe from the project root (`/home/zabouth/AI/Canv` on this machine) so Node resolves `playwright` from `./node_modules`.

## Bundled assets

The skill ships two files you should use rather than re-derive each run:

- **`skills/canv-electron-smoke-test/lib/launch.mjs`** — `launchCanv()` helper that handles the launch dance: `electron.launch`, the DevTools-window filter, optional focus instrumentation + reload, and waiting for first paint. Import with a relative path from your probe.
- **`skills/canv-electron-smoke-test/references/selectors.md`** — selector cheatsheet for the renderer. Look here **before** guessing or grepping source. Covers topbar, activity bar, every sidebar tab, editor, sub-toolbar, bottom panel, status bar, dialogs, chat, and Settings.

If your probe finds a selector that isn't in the cheatsheet, or one that's wrong (a label was renamed in source, an aria-label was added, etc.), **update `references/selectors.md` as part of the same task**. The file's value depends on it staying current.

## The recipe

```js
// probe.mjs — runs from project root so the playwright import resolves.
import { launchCanv } from './skills/canv-electron-smoke-test/lib/launch.mjs'

// instrumentFocus: true installs the focus-history hook then reloads, so the
// hook sees the very first paint. Omit if you don't need focus traces.
const { win, close } = await launchCanv({ instrumentFocus: true })

// Probe the DOM with whatever question you care about. See
// references/selectors.md for stable selectors before reaching for a query.
const result = await win.evaluate(() => ({
  activeTag: document.activeElement?.tagName,
  activeAria: document.activeElement?.getAttribute?.('aria-label') || null,
  activeRole: document.activeElement?.getAttribute?.('role') || null,
  bodyHasFocus: document.hasFocus(),
  focusHistory: window.__focusHistory,
  // …add your own assertions here
}))
console.log(JSON.stringify(result, null, 2))

// Screenshot a region (or omit `clip` for the whole window).
await win.screenshot({ path: '/tmp/canv-probe.png', clip: { x: 0, y: 0, width: 1400, height: 200 } })

await close()
```

If you must inline the launch dance (e.g. you need an option the helper doesn't expose), copy the body of `launchCanv` rather than reimplementing it from memory — the DevTools-window filter, the URL-prefix list, and the `addInitScript` + `reload` ordering all matter.

## Gotchas

- **Probe file must be `.mjs`, not `.ts`.** Node executes it directly — no TypeScript syntax (`as`, `interface`, etc.). Use plain JS.
- **Working directory matters.** Run from project root or set `cwd` explicitly. Otherwise `import 'playwright'` won't resolve.
- **Vite must already be up.** Electron loads `http://localhost:5173` (or `dist/index.html` if `app.isPackaged`). If Vite isn't reachable, you get `chrome-error://chromewebdata/` and probes return junk.
- **Don't take the first window.** Filter on URL — DevTools mounts as `devtools://devtools/bundled/...` and frequently arrives first. (`launchCanv` already handles this.)
- **`addInitScript` only affects future loads.** Always pair it with `win.reload()` if you want it to see the very first paint. (The helper does this when `instrumentFocus: true`.)
- **Don't leave Vite running.** If you started Vite yourself for the probe, kill the specific PID you started — don't `pkill -f "vite$"`, which will murder the user's real dev session. Pattern: capture both the `npm run dev` PID and its `vite` child (via `pgrep -P <ppid>`), kill both, then verify `curl -fs http://localhost:5173 || echo stopped`.
- **Clean up the probe.** Delete `probe.mjs` after the run unless you're committing it as a permanent harness. Don't accidentally commit `node_modules/playwright/` either — `--no-save` keeps it out of `package.json` but the directory stays. That's fine, `.gitignore` covers it.
- **Read the screenshots back.** A passing JSON assertion ≠ the UI rendered correctly. After `win.screenshot(...)`, `Read` the PNG so you can actually see what happened — anchor position, dropdown clipping, overlapping text, focus rings all only show up visually.
- **Workspace contamination.** The probe opens whatever workspace the dev build had last. If your probe mutates state (creates files, edits, switches profiles), expect to see that in the user's real session afterward. Prefer non-destructive probes; if destructive, snapshot the workspace first.

## Common probe patterns

All selectors below are documented in `references/selectors.md`; reach for that file for anything not covered here.

**Did the dropdown open?**
```js
dropdownInDom: !!document.querySelector('[aria-label="Command palette results"]'),
```

**What's focused, including across the focus-history timeline?**
```js
focusHistory: window.__focusHistory,
```

**Does the title-bar overlay reserve the right space?**
```js
const cs = getComputedStyle(document.querySelector('header[role="banner"]'))
return { paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight }
```

**Fire a keyboard shortcut and observe the result.**
```js
await win.keyboard.press('Control+Shift+P')
await win.waitForSelector('[aria-label="Command palette results"]', { timeout: 1000 })
const open = await win.evaluate(() => !!document.querySelector('[aria-label="Command palette results"]'))
```

**Click the topbar input and verify behavior.**
```js
await win.click('input[aria-label="Command palette"]')
await win.keyboard.type('split')
await win.waitForSelector('[aria-label="Command palette results"] li[role="option"]')
const rows = await win.evaluate(() => [...document.querySelectorAll('[aria-label="Command palette results"] li')].map((li) => li.textContent))
```

**Switch sidebar tabs.**
```js
await win.click('button[aria-label="Search"]')
await win.waitForSelector('input[aria-label="Search query"]')
```

**Open the Run-on-document menu.**
```js
await win.click('button[data-testid="document-agent-menu-trigger"]')
await win.waitForSelector('[data-testid="document-agent-menu"]')
const items = await win.evaluate(() => [...document.querySelectorAll('[data-testid="document-agent-menu"] [role="menuitem"]')].map((i) => i.textContent?.trim()))
```

**Toggle Edit ↔ Preview.**
```js
await win.click('button[aria-pressed]:has-text("Preview")')
```

**Prefer `waitForSelector` over `waitForTimeout`.** Magic-number sleeps mask race conditions and slow the probe down. Use `waitForTimeout` only for behavior that has no DOM signal (e.g. animation settling), and keep it under 250ms.

## Reporting back

Quote the actual probe output (DOM state, focus history, screenshot path) in your reply to the user, not your hypothesis. The whole point of this skill is "stop guessing, observe." If you captured screenshots, `Read` them so you can describe what they show, not just that they exist.
