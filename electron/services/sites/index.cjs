'use strict'

const path = require('node:path')
const fs = require('node:fs')
const { BrowserWindow, shell } = require('electron')
const siteRegistry = require('../../site-registry.cjs')
const serve = require('../../serve-folder.cjs')
const { maxMtimeForGlobs } = require('../../glob-mtime.cjs')

/**
 * sites IPC handlers. Called once at app.whenReady from electron/main.cjs.
 * The `deps` object exposes getters for module-scoped state (live values,
 * since workspaces switch at runtime) and shared utilities.
 */
function registerIpcHandlers(ipcMain, deps) {
  function workspaceRootOrThrow() {
    const WORKSPACE = deps.getWorkspace()
    if (WORKSPACE?.kind !== 'local') throw new Error('Sites are only available in local workspaces')
    return WORKSPACE.root
  }

  function emitRegistryChanged() {
    for (const w of BrowserWindow.getAllWindows()) {
      try { w.webContents.send('canvSites:registryChanged') } catch { /* ignore */ }
    }
  }

  ipcMain.handle('canvSites:list', () => {
    const root = workspaceRootOrThrow()
    return siteRegistry.list(root)
  })

  ipcMain.handle('canvSites:register', async (_e, input) => {
    const root = workspaceRootOrThrow()
    const entry = siteRegistry.register(root, input)
    const absSiteRoot = path.join(root, entry.folder)
    const mounted = await serve.mountSite(entry.id, absSiteRoot)
    emitRegistryChanged()
    return { entry, url: mounted.url + (entry.entry === 'index.html' ? '' : entry.entry) }
  })

  ipcMain.handle('canvSites:update', async (_e, id, patch) => {
    const root = workspaceRootOrThrow()
    const entry = siteRegistry.update(root, id, patch)
    emitRegistryChanged()
    return entry
  })

  ipcMain.handle('canvSites:open', async (_e, id) => {
    const root = workspaceRootOrThrow()
    const entry = siteRegistry.get(root, id)
    if (!entry) throw new Error('Unknown site id')
    const absSiteRoot = path.join(root, entry.folder)
    if (!fs.existsSync(absSiteRoot)) throw new Error('Site folder is missing')
    const mounted = await serve.mountSite(entry.id, absSiteRoot)
    const url = mounted.url + (entry.entry === 'index.html' ? '' : entry.entry)
    await shell.openExternal(url)
    return { url }
  })

  ipcMain.handle('canvSites:delete', async (_e, id) => {
    const root = workspaceRootOrThrow()
    const entry = siteRegistry.get(root, id)
    if (!entry) return null
    await serve.unmountSite(id)
    siteRegistry.unregister(root, id)
    const absSiteRoot = path.join(root, entry.folder)
    try { fs.rmSync(absSiteRoot, { recursive: true, force: true }) } catch { /* ignore */ }
    emitRegistryChanged()
    return null
  })

  ipcMain.handle('canvSites:setPinned', async (_e, id, pinned) => {
    const root = workspaceRootOrThrow()
    const entry = siteRegistry.update(root, id, { pinned: Boolean(pinned) })
    emitRegistryChanged()
    return entry
  })

  ipcMain.handle('canvSites:listWithStaleness', () => {
    const root = workspaceRootOrThrow()
    const entries = siteRegistry.list(root)
    return entries.map((e) => {
      const updatedMs = Date.parse(e.updated) || 0
      const max = maxMtimeForGlobs(root, e.source_files || [])
      return { ...e, stale: max > updatedMs }
    })
  })
}

module.exports = { registerIpcHandlers }
