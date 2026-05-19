'use strict'

const serve = require('../../serve-folder.cjs')
const { Registry } = require('../../extensions/registry.cjs')

/**
 * workspace IPC handlers + lifecycle helpers. Called once at app.whenReady
 * from electron/main.cjs.
 *
 * The workspace IPC channels (canvFS:pickWorkspace, canvFS:setWorkspace,
 * canvFS:openRemote, canvFS:closeWorkspace, canvFS:reconnect) share the
 * `canvFS:` prefix and live in services/fs/. This module owns the
 * workspace-lifecycle helpers that those handlers (and main.cjs's
 * window/quit handlers) call via deps:
 *
 *   - closeWorkspace(deps): tears down watcher / SSH pool / serve and nulls
 *     out WORKSPACE + HISTORY in main.
 *   - onWorkspaceChangedGlobal(deps): rebuilds the workspace Registry,
 *     invalidates the extension-claimed-extensions cache, and broadcasts
 *     a registryChanged event to the main window.
 */
function registerIpcHandlers(_ipcMain, _deps) {
  // No handlers — workspace IPC channels share the canvFS prefix and live
  // in services/fs/. This module exists for lifecycle orchestration.
}

async function closeWorkspace(deps) {
  await serve.stop()
  const ws = deps.getWorkspace()
  if (!ws) return
  if (ws.kind === 'local') {
    deps.stopWatcher()
  } else if (ws.kind === 'remote') {
    if (ws.unsub) { try { ws.unsub() } catch { /* ignore */ } }
    try { await ws.pool.close() } catch { /* ignore */ }
  }
  deps.setWorkspace(null)
  deps.setHistory(null)
}

function onWorkspaceChangedGlobal(deps) {
  const ws = deps.getWorkspace()
  deps.setWorkspaceRegistry(
    (ws && ws.kind === 'local') ? new Registry(ws.root) : null,
  )
  deps.invalidateExtensionClaimedExts()
  const mainWindow = deps.getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('canvExtensions:registryChanged')
  }
}

module.exports = { registerIpcHandlers, closeWorkspace, onWorkspaceChangedGlobal }
