// Boilerplate for driving the Canv dev Electron build via Playwright.
// Import from your probe with a relative path, e.g.:
//   import { launchCanv } from './skills/canv-electron-smoke-test/lib/launch.mjs'
//
// Returns { app, win, close }:
//   - app:   the ElectronApplication
//   - win:   the renderer Page (filtered past the detached DevTools window)
//   - close: () => Promise<void>, calls app.close()
//
// Options:
//   cwd               (default: process.cwd()) — must resolve `playwright` from
//                     ./node_modules. Run probes from project root.
//   instrumentFocus   (default false) — installs an init script that records
//                     every `focusin` event and every programmatic .focus()
//                     call into `window.__focusHistory`, then reloads so the
//                     hook sees the very first paint.
//   waitFor           (default 'header[role="banner"]') — selector to await
//                     before returning. Use a stable container that paints on
//                     first frame. Set to null to skip.
//   launchTimeoutMs   (default 30000) — passed to electron.launch.
//   windowSearchAttempts / windowSearchIntervalMs — how patient to be while
//                     waiting for the renderer window to appear past the
//                     detached DevTools window.

import { _electron as electron } from 'playwright'

const VITE_URL_PREFIXES = ['http://localhost:5173', 'http://127.0.0.1:5173']

export async function launchCanv({
  cwd = process.cwd(),
  instrumentFocus = false,
  waitFor = 'header[role="banner"]',
  launchTimeoutMs = 30000,
  windowSearchAttempts = 60,
  windowSearchIntervalMs = 300,
} = {}) {
  const app = await electron.launch({
    args: ['.'],
    cwd,
    env: { ...process.env, NODE_ENV: 'development' },
    timeout: launchTimeoutMs,
  })

  let win = null
  for (let i = 0; i < windowSearchAttempts; i++) {
    for (const w of app.windows()) {
      const u = w.url()
      if (VITE_URL_PREFIXES.some((p) => u.startsWith(p))) {
        win = w
        break
      }
    }
    if (win) break
    await new Promise((r) => setTimeout(r, windowSearchIntervalMs))
  }
  if (!win) {
    const seen = app.windows().map((w) => w.url()).join(', ')
    await app.close().catch(() => {})
    throw new Error(`main app window never appeared; saw: ${seen}`)
  }

  await win.waitForLoadState('domcontentloaded')

  if (instrumentFocus) {
    await win.addInitScript(() => {
      window.__focusHistory = []
      document.addEventListener('focusin', (e) => {
        const t = e.target
        window.__focusHistory.push({
          t: performance.now().toFixed(0),
          tag: t?.tagName,
          aria: t?.getAttribute?.('aria-label') || null,
          role: t?.getAttribute?.('role') || null,
        })
      }, true)
      const origFocus = HTMLElement.prototype.focus
      HTMLElement.prototype.focus = function (...args) {
        const err = new Error()
        window.__focusHistory.push({
          t: performance.now().toFixed(0),
          tag: this.tagName,
          aria: this.getAttribute?.('aria-label') || null,
          via: 'focus()',
          stack: (err.stack || '').split('\n').slice(1, 6).join('\n'),
        })
        return origFocus.apply(this, args)
      }
    })
    await win.reload({ waitUntil: 'domcontentloaded' })
  }

  if (waitFor) await win.waitForSelector(waitFor)

  return {
    app,
    win,
    close: () => app.close(),
  }
}
