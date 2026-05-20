'use strict'

/**
 * canv:// URI dispatch.
 *
 * Two responsibilities:
 *  1. Queue + flush — extensions and the runtime aren't ready at the moment
 *     the OS hands us a deep link, so enqueue() buffers URIs until
 *     setDispatcher() wires up the real handler (typically extensionRuntime.
 *     activateByUri) and drains the backlog.
 *  2. Protocol handler registration — installs `canv://` as this app's
 *     handler, holds the single-instance lock, and forwards URIs delivered
 *     via open-url (macOS) or second-instance argv (Windows/Linux) into
 *     enqueue(). Gated on app.isPackaged + !process.defaultApp so dev/
 *     `electron .` runs never clobber a packaged Canv on the same machine.
 */

const PROTOCOL = 'canv'
const queued = []
let dispatcher = null

function setDispatcher(fn) {
  dispatcher = fn
  while (queued.length > 0 && dispatcher) {
    const uri = queued.shift()
    try { dispatcher(uri) } catch (e) { console.error('uri dispatch failed:', e) }
  }
}

function enqueue(uri) {
  if (typeof uri !== 'string' || !uri.startsWith(`${PROTOCOL}://`)) return
  if (dispatcher) {
    try { dispatcher(uri) } catch (e) { console.error('uri dispatch failed:', e) }
  } else {
    queued.push(uri)
  }
}

function registerProtocolHandler({ app, getMainWindow }) {
  // Skip in dev and when running via `electron .` to avoid stealing canv://
  // links from an installed packaged Canv on the same machine.
  if (!app.isPackaged) return
  if (process.defaultApp) return

  app.setAsDefaultProtocolClient(PROTOCOL)

  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
    return
  }

  // macOS — open-url fires when the OS hands a deep link to a running instance.
  app.on('open-url', (event, url) => {
    event.preventDefault()
    enqueue(url)
    const win = typeof getMainWindow === 'function' ? getMainWindow() : null
    if (win) { try { win.show(); win.focus() } catch { /* ignore */ } }
  })

  // Win/Linux — second-instance fires when the OS launches a second copy with
  // the URL on argv; forward it to this (the primary) instance.
  app.on('second-instance', (_event, argv) => {
    const uri = argv.find((a) => typeof a === 'string' && a.startsWith(`${PROTOCOL}://`))
    if (uri) enqueue(uri)
    const win = typeof getMainWindow === 'function' ? getMainWindow() : null
    if (win) {
      try {
        if (win.isMinimized()) win.restore()
        win.show(); win.focus()
      } catch { /* ignore */ }
    }
  })

  // First-launch case (Win/Linux): the URL is on this process's argv.
  const initialUri = process.argv.find((a) => typeof a === 'string' && a.startsWith(`${PROTOCOL}://`))
  if (initialUri) enqueue(initialUri)
}

module.exports = { registerProtocolHandler, setDispatcher, enqueue, PROTOCOL }
