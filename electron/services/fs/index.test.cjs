'use strict'
// describe/it/expect/beforeEach/afterEach/vi are injected by vitest globals.

const Module = require('node:module')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')

// ---------------------------------------------------------------------------
// Mock the `electron` package via require.cache BEFORE loading the service.
// vi.mock('electron', ...) does not hoist in CJS contexts; instead we replace
// the module's exports in-place. Tests `vi.spyOn` on these stub methods to
// control behaviour per-test.
// ---------------------------------------------------------------------------
const electronPath = require.resolve('electron')
const electron = {
  app: { getPath: () => os.tmpdir() },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  shell: { openPath: async () => '', trashItem: async () => undefined },
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

function baseDeps(root, overrides = {}) {
  return {
    getWorkspace: () => ({ kind: 'local', root }),
    requireWorkspace: () => root,
    isRemote: () => false,
    safeResolve: (r, rel) => {
      const abs = path.resolve(r, rel)
      if (!abs.startsWith(r + path.sep) && abs !== r) {
        throw new Error('path outside workspace')
      }
      return abs
    },
    isAllowedExt: () => true,
    isAllowedDirEntry: () => true,
    buildTree: async () => [],
    getMainWindow: () => null,
    closeWorkspace: async () => {},
    setWorkspace: () => {},
    setHistory: () => {},
    onWorkspaceChangedGlobal: () => {},
    toRel: (r, abs) => path.relative(r, abs).replace(/\\/g, '/'),
    getRecentRemotes: () => null,
    ...overrides,
  }
}

describe('fs service IPC handlers', () => {
  let root, ipcMain

  beforeEach(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'fs-svc-'))
    ipcMain = makeIpcMain()
    svc.registerIpcHandlers(ipcMain, baseDeps(root))
  })

  afterEach(async () => {
    svc.stopWatcher()
    await fsp.rm(root, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('registers IPC handlers without throwing', () => {
    expect(typeof ipcMain.invoke).toBe('function')
  })

  // ---------------------------------------------------------------------------
  // canvConfig:* — user-data config dir management
  // ---------------------------------------------------------------------------

  describe('canvConfig:list', () => {
    it('happy: returns configDir + seeded files from userData', async () => {
      const userData = await fsp.mkdtemp(path.join(os.tmpdir(), 'fs-userdata-'))
      try {
        vi.spyOn(electron.app, 'getPath').mockReturnValue(userData)
        const r = await ipcMain.invoke('canvConfig:list')
        expect(r.configDir).toBe(path.join(userData, 'config'))
        expect(Array.isArray(r.files)).toBe(true)
        // loadConfigDir re-seeds built-in YAMLs; expect at least one.
        const names = r.files.map((f) => f.file)
        expect(names).toContain('fiction.yaml')
      } finally {
        await fsp.rm(userData, { recursive: true, force: true })
      }
    })

    it('error: surfaces failures when getPath throws', async () => {
      vi.spyOn(electron.app, 'getPath').mockImplementation(() => {
        throw new Error('no user-data path')
      })
      await expect(ipcMain.invoke('canvConfig:list')).rejects.toThrow(/no user-data path/)
    })
  })

  describe('canvConfig:revealFolder', () => {
    it('happy: calls shell.openPath with the config dir', async () => {
      const userData = await fsp.mkdtemp(path.join(os.tmpdir(), 'fs-userdata-'))
      try {
        vi.spyOn(electron.app, 'getPath').mockReturnValue(userData)
        const open = vi.spyOn(electron.shell, 'openPath').mockResolvedValue('')
        await ipcMain.invoke('canvConfig:revealFolder')
        expect(open).toHaveBeenCalledTimes(1)
        expect(open.mock.calls[0][0]).toBe(path.join(userData, 'config'))
      } finally {
        await fsp.rm(userData, { recursive: true, force: true })
      }
    })

    it('error: propagates shell.openPath failures', async () => {
      vi.spyOn(electron.app, 'getPath').mockReturnValue(os.tmpdir())
      vi.spyOn(electron.shell, 'openPath').mockRejectedValue(new Error('shell unavailable'))
      await expect(ipcMain.invoke('canvConfig:revealFolder')).rejects.toThrow(/shell unavailable/)
    })
  })

  describe('canvConfig:factoryReset', () => {
    it('happy: removes config dir and recent-remotes.json from userData', async () => {
      const userData = await fsp.mkdtemp(path.join(os.tmpdir(), 'fs-userdata-'))
      const configDir = path.join(userData, 'config')
      const recent = path.join(userData, 'recent-remotes.json')
      try {
        await fsp.mkdir(configDir, { recursive: true })
        await fsp.writeFile(path.join(configDir, 'fiction.yaml'), 'name: test\n')
        await fsp.writeFile(recent, '[]')
        vi.spyOn(electron.app, 'getPath').mockReturnValue(userData)
        const r = await ipcMain.invoke('canvConfig:factoryReset')
        expect(r).toEqual({ ok: true })
        expect(fs.existsSync(configDir)).toBe(false)
        expect(fs.existsSync(recent)).toBe(false)
      } finally {
        await fsp.rm(userData, { recursive: true, force: true })
      }
    })

    it('error: propagates fs.rmSync failures', async () => {
      vi.spyOn(electron.app, 'getPath').mockReturnValue(os.tmpdir())
      vi.spyOn(fs, 'rmSync').mockImplementation(() => {
        throw new Error('rm denied')
      })
      await expect(ipcMain.invoke('canvConfig:factoryReset')).rejects.toThrow(/rm denied/)
    })
  })
})
