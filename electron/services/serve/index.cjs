'use strict'

const path = require('node:path')
const { shell } = require('electron')
const serve = require('../../serve-folder.cjs')

/**
 * serve IPC handlers. Called once at app.whenReady from electron/main.cjs.
 * The `deps` object exposes getters for module-scoped state (live values,
 * since workspaces switch at runtime) and shared utilities.
 */
function registerIpcHandlers(ipcMain, deps) {
  ipcMain.handle('canvServe:start', async (_e, relPath) => {
    if (typeof relPath !== 'string') throw new Error('relPath required')
    const WORKSPACE = deps.getWorkspace()
    if (!WORKSPACE || WORKSPACE.kind !== 'local') throw new Error('serve requires a local workspace')
    const absRoot = path.resolve(path.join(WORKSPACE.root, relPath))
    // Defence-in-depth: relPath should not allow escaping the workspace.
    const resolvedWs = path.resolve(WORKSPACE.root)
    if (absRoot !== resolvedWs && !absRoot.startsWith(resolvedWs + path.sep)) {
      throw new Error('serve target must be inside workspace')
    }
    try {
      const { url } = await serve.start(absRoot)
      shell.openExternal(url).catch(() => {})
      return { url }
    } catch (err) {
      if (err && err.code === 'NO_INDEX') return { error: 'NO_INDEX' }
      throw err
    }
  })

  ipcMain.handle('canvServe:stop', async () => { await serve.stop(); return null })

  ipcMain.handle('canvServe:status', () => {
    const s = serve.status()
    const WORKSPACE = deps.getWorkspace()
    if (s.running && WORKSPACE && WORKSPACE.kind === 'local') {
      const resolvedWs = path.resolve(WORKSPACE.root)
      const rel = path.relative(resolvedWs, s.root).split(path.sep).join('/')
      return { ...s, relPath: rel }
    }
    return s
  })
}

module.exports = { registerIpcHandlers }
