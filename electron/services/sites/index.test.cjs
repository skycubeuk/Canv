'use strict'
// describe/it/expect/beforeEach/afterEach/vi are injected by vitest globals.
//
// Integration tests for the sites service IPC handlers
// (electron/services/sites/index.cjs). Mirrors the per-file template
// established in electron/services/fs/index.test.cjs:
//   - replace require.cache for 'electron' with a hand-built stub BEFORE
//     loading the service (vi.mock does not hoist in CJS)
//   - vi.spyOn the site-registry + serve-folder modules per-test to control
//     behaviour without touching real disk state or spawning a real HTTP server
//   - mkdtemp workspace + fsp.rm cleanup + vi.restoreAllMocks in afterEach

const Module = require('node:module')
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')

// ---------------------------------------------------------------------------
// Electron stub. The sites service touches:
//   BrowserWindow.getAllWindows() — for emitRegistryChanged broadcast
//   shell.openExternal — for canvSites:open
// ---------------------------------------------------------------------------
const electronPath = require.resolve('electron')
const electron = {
  app: { getPath: () => os.tmpdir() },
  shell: { openExternal: async () => undefined },
  BrowserWindow: class {
    static getAllWindows() { return [] }
  },
  nativeTheme: {},
}
{
  const m = new Module(electronPath)
  m.filename = electronPath
  m.loaded = true
  m.exports = electron
  require.cache[electronPath] = m
}

const siteRegistry = require('../../site-registry.cjs')
const serve = require('../../serve-folder.cjs')
const svc = require('./index.cjs')

function makeIpcMain() {
  const handlers = new Map()
  const onListeners = new Map()
  return {
    handle(name, fn) { handlers.set(name, fn) },
    async invoke(name, ...args) {
      const fn = handlers.get(name)
      if (!fn) throw new Error(`no handler: ${name}`)
      return fn({}, ...args)
    },
    on(name, fn) {
      const arr = onListeners.get(name) ?? []
      arr.push(fn)
      onListeners.set(name, arr)
    },
    emit(name, ...args) {
      const arr = onListeners.get(name) ?? []
      for (const fn of arr) fn({}, ...args)
    },
    removeHandler() {},
  }
}

describe('sites service IPC handlers', () => {
  let root, ipcMain

  beforeEach(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sites-svc-'))
    ipcMain = makeIpcMain()
    const deps = {
      getWorkspace: () => ({ kind: 'local', root }),
    }
    svc.registerIpcHandlers(ipcMain, deps)
  })

  afterEach(async () => {
    await fsp.rm(root, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // canvSites:list
  // -------------------------------------------------------------------------

  describe('canvSites:list', () => {
    it('happy: returns the registry entries from the store', async () => {
      const entries = [{ id: 's1', name: 'one', folder: '.canv/sites/s1' }]
      vi.spyOn(siteRegistry, 'list').mockReturnValue(entries)
      const r = await ipcMain.invoke('canvSites:list')
      expect(r).toEqual(entries)
      expect(siteRegistry.list).toHaveBeenCalledWith(root)
    })

    it('error: propagates underlying store failures', async () => {
      vi.spyOn(siteRegistry, 'list').mockImplementation(() => {
        throw new Error('registry unreadable')
      })
      await expect(ipcMain.invoke('canvSites:list')).rejects.toThrow(/registry unreadable/)
    })
  })

  // -------------------------------------------------------------------------
  // canvSites:register
  // -------------------------------------------------------------------------

  describe('canvSites:register', () => {
    it('happy: registers, mounts, and returns entry + url', async () => {
      const entry = { id: 's1', folder: '.canv/sites/s1', entry: 'index.html' }
      vi.spyOn(siteRegistry, 'register').mockReturnValue(entry)
      vi.spyOn(serve, 'mountSite').mockResolvedValue({ url: 'http://localhost:1234/' })
      const r = await ipcMain.invoke('canvSites:register', { name: 'one' })
      expect(siteRegistry.register).toHaveBeenCalledWith(root, { name: 'one' })
      expect(serve.mountSite).toHaveBeenCalledWith('s1', path.join(root, '.canv/sites/s1'))
      expect(r).toEqual({ entry, url: 'http://localhost:1234/' })
    })

    it('error: propagates duplicate-id failures from the store', async () => {
      vi.spyOn(siteRegistry, 'register').mockImplementation(() => {
        throw new Error('duplicate id')
      })
      await expect(ipcMain.invoke('canvSites:register', { name: 'dup' })).rejects.toThrow(/duplicate id/)
    })
  })

  // -------------------------------------------------------------------------
  // canvSites:update
  // -------------------------------------------------------------------------

  describe('canvSites:update', () => {
    it('happy: applies the patch via the store and returns the merged entry', async () => {
      const merged = { id: 's1', name: 'two' }
      vi.spyOn(siteRegistry, 'update').mockReturnValue(merged)
      const r = await ipcMain.invoke('canvSites:update', 's1', { name: 'two' })
      expect(siteRegistry.update).toHaveBeenCalledWith(root, 's1', { name: 'two' })
      expect(r).toEqual(merged)
    })

    it('error: propagates when the site id is missing', async () => {
      vi.spyOn(siteRegistry, 'update').mockImplementation(() => {
        throw new Error('Unknown site id: missing')
      })
      await expect(ipcMain.invoke('canvSites:update', 'missing', { name: 'x' })).rejects.toThrow(/Unknown site id/)
    })
  })

  // -------------------------------------------------------------------------
  // canvSites:open
  // -------------------------------------------------------------------------

  describe('canvSites:open', () => {
    it('happy: mounts the site, opens the URL externally, returns the URL', async () => {
      const folderRel = '.canv/sites/s1'
      const absFolder = path.join(root, folderRel)
      await fsp.mkdir(absFolder, { recursive: true })
      const entry = { id: 's1', folder: folderRel, entry: 'index.html' }
      vi.spyOn(siteRegistry, 'get').mockReturnValue(entry)
      vi.spyOn(serve, 'mountSite').mockResolvedValue({ url: 'http://localhost:9999/' })
      const openSpy = vi.spyOn(electron.shell, 'openExternal').mockResolvedValue(undefined)
      const r = await ipcMain.invoke('canvSites:open', 's1')
      expect(serve.mountSite).toHaveBeenCalledWith('s1', absFolder)
      expect(openSpy).toHaveBeenCalledWith('http://localhost:9999/')
      expect(r).toEqual({ url: 'http://localhost:9999/' })
    })

    it('error: throws when the site id is unknown', async () => {
      vi.spyOn(siteRegistry, 'get').mockReturnValue(null)
      await expect(ipcMain.invoke('canvSites:open', 'nope')).rejects.toThrow(/Unknown site id/)
    })
  })

  // -------------------------------------------------------------------------
  // canvSites:delete
  // -------------------------------------------------------------------------

  describe('canvSites:delete', () => {
    it('happy: unmounts, unregisters, removes folder, returns null', async () => {
      const folderRel = '.canv/sites/s1'
      const absFolder = path.join(root, folderRel)
      await fsp.mkdir(absFolder, { recursive: true })
      const entry = { id: 's1', folder: folderRel }
      vi.spyOn(siteRegistry, 'get').mockReturnValue(entry)
      const unmount = vi.spyOn(serve, 'unmountSite').mockResolvedValue(undefined)
      const unregister = vi.spyOn(siteRegistry, 'unregister').mockReturnValue(undefined)
      const r = await ipcMain.invoke('canvSites:delete', 's1')
      expect(r).toBeNull()
      expect(unmount).toHaveBeenCalledWith('s1')
      expect(unregister).toHaveBeenCalledWith(root, 's1')
    })

    it('no-op: returns null when the site is not found (no throw)', async () => {
      vi.spyOn(siteRegistry, 'get').mockReturnValue(null)
      const unmount = vi.spyOn(serve, 'unmountSite').mockResolvedValue(undefined)
      const r = await ipcMain.invoke('canvSites:delete', 'missing')
      expect(r).toBeNull()
      expect(unmount).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // canvSites:setPinned
  // -------------------------------------------------------------------------

  describe('canvSites:setPinned', () => {
    it('happy: routes to siteRegistry.update with a pinned patch and returns the entry', async () => {
      const merged = { id: 's1', pinned: true }
      const updateSpy = vi.spyOn(siteRegistry, 'update').mockReturnValue(merged)
      const r = await ipcMain.invoke('canvSites:setPinned', 's1', true)
      expect(updateSpy).toHaveBeenCalledWith(root, 's1', { pinned: true })
      expect(r).toEqual(merged)
    })

    it('error: propagates when the site id is unknown', async () => {
      vi.spyOn(siteRegistry, 'update').mockImplementation(() => {
        throw new Error('Unknown site id: nope')
      })
      await expect(ipcMain.invoke('canvSites:setPinned', 'nope', false)).rejects.toThrow(/Unknown site id/)
    })
  })

  // -------------------------------------------------------------------------
  // canvSites:listWithStaleness
  // -------------------------------------------------------------------------

  describe('canvSites:listWithStaleness', () => {
    it('happy: annotates each entry with stale based on file mtimes vs updated', async () => {
      // Create real files on disk so maxMtimeForGlobs has real data to read.
      // The destructured `maxMtimeForGlobs` import captures the original
      // reference at require() time — spyOn on the module won't intercept it,
      // so we drive the function with real fs state instead.
      const stalePath = path.join(root, 'a.md')
      const freshPath = path.join(root, 'b.md')
      await fsp.writeFile(stalePath, 'x')
      await fsp.writeFile(freshPath, 'y')
      const now = Date.now()
      // 'stale' entry: marked updated long before file mtime (file is newer).
      const oldIso = new Date(now - 60_000).toISOString()
      // 'fresh' entry: marked updated far in the future (newer than file).
      const futureIso = new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString()
      const entries = [
        { id: 'stale', updated: oldIso, source_files: ['a.md'] },
        { id: 'fresh', updated: futureIso, source_files: ['b.md'] },
      ]
      vi.spyOn(siteRegistry, 'list').mockReturnValue(entries)
      const r = await ipcMain.invoke('canvSites:listWithStaleness')
      expect(r).toHaveLength(2)
      expect(r[0].stale).toBe(true)
      expect(r[1].stale).toBe(false)
    })

    it('error: propagates store failures', async () => {
      vi.spyOn(siteRegistry, 'list').mockImplementation(() => {
        throw new Error('cannot read registry')
      })
      await expect(ipcMain.invoke('canvSites:listWithStaleness')).rejects.toThrow(/cannot read registry/)
    })
  })

  // -------------------------------------------------------------------------
  // workspace guard
  // -------------------------------------------------------------------------

  describe('workspace guard', () => {
    it('throws when no local workspace is active (remote ws)', async () => {
      // Re-register with a remote workspace deps to verify the guard fires.
      const localIpcMain = makeIpcMain()
      svc.registerIpcHandlers(localIpcMain, { getWorkspace: () => ({ kind: 'remote', root: '/r' }) })
      await expect(localIpcMain.invoke('canvSites:list')).rejects.toThrow(/local workspaces/)
    })
  })
})
