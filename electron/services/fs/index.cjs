'use strict'

const path = require('node:path')
const fs = require('node:fs')
const { app, shell } = require('electron')
const { loadConfigDir } = require('../../config-loader.cjs')

/**
 * fs IPC handlers. Called once at app.whenReady from electron/main.cjs.
 * The `deps` object exposes getters for module-scoped state (live values,
 * since workspaces switch at runtime) and shared utilities.
 */
function registerIpcHandlers(ipcMain, _deps) {
  ipcMain.handle('canvConfig:list', async () => {
    const userDataDir = app.getPath('userData')
    const { configDir, files } = loadConfigDir({ userDataDir })
    return { configDir, files }
  })

  ipcMain.handle('canvConfig:revealFolder', async () => {
    const userDataDir = app.getPath('userData')
    const configDir = path.join(userDataDir, 'config')
    await shell.openPath(configDir)
  })

  // Factory reset: delete every Canv-owned file under userData so the next
  // launch sees first-run state. Defaults will be re-seeded by loadConfigDir.
  // Renderer is responsible for wiping its own localStorage before/after.
  ipcMain.handle('canvConfig:factoryReset', async () => {
    const userDataDir = app.getPath('userData')
    const configDir = path.join(userDataDir, 'config')
    const recentRemotesFile = path.join(userDataDir, 'recent-remotes.json')
    fs.rmSync(configDir, { recursive: true, force: true })
    fs.rmSync(recentRemotesFile, { force: true })
    return { ok: true }
  })
}

module.exports = { registerIpcHandlers }
