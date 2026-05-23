'use strict'
// describe/it/expect/beforeEach/afterEach/vi are injected by vitest globals.
//
// Integration tests for the serve service IPC handlers
// (electron/services/serve/index.cjs). Mirrors the per-file template
// established in electron/services/fs/index.test.cjs.
//
// The service delegates to the serve-folder helper (start/stop/status). We
// vi.spyOn those methods to avoid spinning up a real HTTP server.

const Module = require('node:module')
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')

// ---------------------------------------------------------------------------
// Electron stub. The serve service only uses shell.openExternal (fire and
// forget on canvServe:start). Other electron surfaces are unused.
// ---------------------------------------------------------------------------
const electronPath = require.resolve('electron')
const electron = {
  app: { getPath: () => os.tmpdir() },
  shell: { openExternal: async () => undefined },
  BrowserWindow: class {},
  nativeTheme: {},
}
{
  const m = new Module(electronPath)
  m.filename = electronPath
  m.loaded = true
  m.exports = electron
  require.cache[electronPath] = m
}

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

describe('serve service IPC handlers', () => {
  let root, ipcMain

  beforeEach(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'serve-svc-'))
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
  // canvServe:start
  // -------------------------------------------------------------------------

  describe('canvServe:start', () => {
    it('happy: starts the server for a path inside the workspace and returns the URL', async () => {
      const subDir = path.join(root, 'docs')
      await fsp.mkdir(subDir, { recursive: true })
      const startSpy = vi.spyOn(serve, 'start').mockResolvedValue({ url: 'http://localhost:5555/' })
      const openSpy = vi.spyOn(electron.shell, 'openExternal').mockResolvedValue(undefined)
      const r = await ipcMain.invoke('canvServe:start', 'docs')
      expect(startSpy).toHaveBeenCalledWith(subDir)
      expect(openSpy).toHaveBeenCalledWith('http://localhost:5555/')
      expect(r).toEqual({ url: 'http://localhost:5555/' })
    })

    it('error: throws when the target escapes the workspace root', async () => {
      vi.spyOn(serve, 'start').mockResolvedValue({ url: 'http://x' })
      await expect(ipcMain.invoke('canvServe:start', '../escape')).rejects.toThrow(/inside workspace/)
    })

    it('NO_INDEX is converted to a soft error payload', async () => {
      // The handler catches ServeError with code NO_INDEX and returns {error}.
      const err = new serve.ServeError('NO_INDEX', 'no index.md')
      vi.spyOn(serve, 'start').mockRejectedValue(err)
      const r = await ipcMain.invoke('canvServe:start', '.')
      expect(r).toEqual({ error: 'NO_INDEX' })
    })

    it('error: relPath must be a string', async () => {
      await expect(ipcMain.invoke('canvServe:start', 123)).rejects.toThrow(/relPath required/)
    })

    it('error: requires a local workspace', async () => {
      const ipc2 = makeIpcMain()
      svc.registerIpcHandlers(ipc2, { getWorkspace: () => ({ kind: 'remote', root: '/r' }) })
      await expect(ipc2.invoke('canvServe:start', '.')).rejects.toThrow(/local workspace/)
    })
  })

  // -------------------------------------------------------------------------
  // canvServe:stop
  // -------------------------------------------------------------------------

  describe('canvServe:stop', () => {
    it('happy: stops the active server and returns null', async () => {
      const stopSpy = vi.spyOn(serve, 'stop').mockResolvedValue(undefined)
      const r = await ipcMain.invoke('canvServe:stop')
      expect(stopSpy).toHaveBeenCalled()
      expect(r).toBeNull()
    })

    it('no-op: returns null even when serve.stop is a noop (nothing running)', async () => {
      vi.spyOn(serve, 'stop').mockResolvedValue(undefined)
      const r = await ipcMain.invoke('canvServe:stop')
      expect(r).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // canvServe:status
  // -------------------------------------------------------------------------

  describe('canvServe:status', () => {
    it('happy (running): annotates status with relPath against workspace root', async () => {
      const serveRoot = path.join(root, 'docs', 'sub')
      vi.spyOn(serve, 'status').mockReturnValue({ running: true, port: 4321, root: serveRoot })
      const r = await ipcMain.invoke('canvServe:status')
      expect(r.running).toBe(true)
      expect(r.port).toBe(4321)
      expect(r.relPath).toBe('docs/sub')
    })

    it('not-running: returns the raw status (no relPath annotation)', async () => {
      vi.spyOn(serve, 'status').mockReturnValue({ running: false })
      const r = await ipcMain.invoke('canvServe:status')
      expect(r).toEqual({ running: false })
    })
  })
})
