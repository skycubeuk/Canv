'use strict'

/**
 * fs IPC handlers. Called once at app.whenReady from electron/main.cjs.
 * The `deps` object exposes getters for module-scoped state (live values,
 * since workspaces switch at runtime) and shared utilities.
 *
 * Handlers move in across Phase 2 tasks 21–28.
 */
function registerIpcHandlers(_ipcMain, _deps) {
  // Handlers move in across tasks 21–28.
}

module.exports = { registerIpcHandlers }
