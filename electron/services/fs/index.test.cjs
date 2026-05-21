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

const sshPoolMod = require('../../ssh-pool.cjs')
const remoteFsMod = require('../../remote-fs.cjs')

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

  // ---------------------------------------------------------------------------
  // Workspace lifecycle handlers
  // ---------------------------------------------------------------------------

  describe('canvFS:pickWorkspace', () => {
    it('happy: dialog returns a path → sets workspace and returns { root }', async () => {
      const picked = await fsp.mkdtemp(path.join(os.tmpdir(), 'fs-picked-'))
      try {
        const setWs = vi.fn()
        const closeWs = vi.fn(async () => {})
        const onChanged = vi.fn()
        const ipc = makeIpcMain()
        svc.registerIpcHandlers(ipc, baseDeps(root, {
          getMainWindow: () => ({ webContents: { send: () => {} } }),
          setWorkspace: setWs,
          closeWorkspace: closeWs,
          onWorkspaceChangedGlobal: onChanged,
        }))
        vi.spyOn(electron.dialog, 'showOpenDialog').mockResolvedValue({
          canceled: false,
          filePaths: [picked],
        })
        const r = await ipc.invoke('canvFS:pickWorkspace')
        expect(r).toEqual({ root: picked })
        expect(setWs).toHaveBeenCalledWith({ kind: 'local', root: picked })
        expect(closeWs).toHaveBeenCalled()
        expect(onChanged).toHaveBeenCalled()
        svc.stopWatcher()
      } finally {
        await fsp.rm(picked, { recursive: true, force: true })
      }
    })

    it('error: dialog cancelled → returns null', async () => {
      const ipc = makeIpcMain()
      svc.registerIpcHandlers(ipc, baseDeps(root, {
        getMainWindow: () => ({ webContents: { send: () => {} } }),
      }))
      vi.spyOn(electron.dialog, 'showOpenDialog').mockResolvedValue({
        canceled: true,
        filePaths: [],
      })
      const r = await ipc.invoke('canvFS:pickWorkspace')
      expect(r).toBeNull()
    })
  })

  describe('canvFS:setWorkspace', () => {
    it('happy: valid directory → sets workspace and updates state', async () => {
      const target = await fsp.mkdtemp(path.join(os.tmpdir(), 'fs-setws-'))
      try {
        const setWs = vi.fn()
        const closeWs = vi.fn(async () => {})
        const ipc = makeIpcMain()
        svc.registerIpcHandlers(ipc, baseDeps(root, {
          getMainWindow: () => ({ webContents: { send: () => {} } }),
          setWorkspace: setWs,
          closeWorkspace: closeWs,
        }))
        await ipc.invoke('canvFS:setWorkspace', target)
        expect(setWs).toHaveBeenCalledWith({ kind: 'local', root: target })
        expect(closeWs).toHaveBeenCalled()
        svc.stopWatcher()
      } finally {
        await fsp.rm(target, { recursive: true, force: true })
      }
    })

    it('error: invalid (non-existent) path → throws', async () => {
      const ipc = makeIpcMain()
      svc.registerIpcHandlers(ipc, baseDeps(root))
      const fake = path.join(os.tmpdir(), 'definitely-does-not-exist-' + Date.now())
      await expect(ipc.invoke('canvFS:setWorkspace', fake)).rejects.toThrow(/workspace folder does not exist/)
    })

    it('error: non-string root → throws "invalid root"', async () => {
      await expect(ipcMain.invoke('canvFS:setWorkspace', null)).rejects.toThrow(/invalid root/)
    })
  })

  describe('canvFS:getWorkspace', () => {
    it('happy: local workspace set → returns the root path', async () => {
      const r = await ipcMain.invoke('canvFS:getWorkspace')
      expect(r).toBe(root)
    })

    it('error: no workspace → returns null', async () => {
      const ipc = makeIpcMain()
      svc.registerIpcHandlers(ipc, baseDeps(root, { getWorkspace: () => null }))
      const r = await ipc.invoke('canvFS:getWorkspace')
      expect(r).toBeNull()
    })
  })

  describe('canvFS:getWorkspaceKind', () => {
    it('happy: local workspace → returns { kind:"local", root }', async () => {
      const r = await ipcMain.invoke('canvFS:getWorkspaceKind')
      expect(r).toEqual({ kind: 'local', root })
    })

    it('happy: remote workspace → returns { kind:"remote", display }', async () => {
      const ipc = makeIpcMain()
      svc.registerIpcHandlers(ipc, baseDeps(root, {
        getWorkspace: () => ({
          kind: 'remote',
          target: { user: 'alice', host: 'box', port: 22, path: '/srv/notes' },
        }),
      }))
      const r = await ipc.invoke('canvFS:getWorkspaceKind')
      expect(r).toEqual({ kind: 'remote', display: 'alice@box:/srv/notes' })
    })

    it('error: no workspace → returns null', async () => {
      const ipc = makeIpcMain()
      svc.registerIpcHandlers(ipc, baseDeps(root, { getWorkspace: () => null }))
      const r = await ipc.invoke('canvFS:getWorkspaceKind')
      expect(r).toBeNull()
    })
  })

  describe('canvFS:closeWorkspace', () => {
    it('happy: calls deps.closeWorkspace and onWorkspaceChangedGlobal', async () => {
      const closeWs = vi.fn(async () => {})
      const onChanged = vi.fn()
      const ipc = makeIpcMain()
      svc.registerIpcHandlers(ipc, baseDeps(root, {
        closeWorkspace: closeWs,
        onWorkspaceChangedGlobal: onChanged,
      }))
      const r = await ipc.invoke('canvFS:closeWorkspace')
      expect(r).toBeUndefined()
      expect(closeWs).toHaveBeenCalledTimes(1)
      expect(onChanged).toHaveBeenCalledTimes(1)
    })

    it('error: propagates closeWorkspace failures', async () => {
      const ipc = makeIpcMain()
      svc.registerIpcHandlers(ipc, baseDeps(root, {
        closeWorkspace: async () => { throw new Error('close failed') },
      }))
      await expect(ipc.invoke('canvFS:closeWorkspace')).rejects.toThrow(/close failed/)
    })
  })

  describe('canvFS:listRecentRemotes', () => {
    it('happy: returns the list from getRecentRemotes()', async () => {
      const entries = [{ raw: 'me@a:/x', lastUsed: 1 }, { raw: 'me@b:/y', lastUsed: 2 }]
      const ipc = makeIpcMain()
      svc.registerIpcHandlers(ipc, baseDeps(root, {
        getRecentRemotes: () => ({ list: () => entries, record: () => {} }),
      }))
      const r = await ipc.invoke('canvFS:listRecentRemotes')
      expect(r).toEqual(entries)
    })

    it('error: getRecentRemotes returns null → returns empty array', async () => {
      const r = await ipcMain.invoke('canvFS:listRecentRemotes')
      expect(r).toEqual([])
    })
  })

  describe('canvFS:openRemote', () => {
    it('error: empty input → throws "invalid target"', async () => {
      await expect(ipcMain.invoke('canvFS:openRemote', '')).rejects.toThrow(/invalid target/)
      await expect(ipcMain.invoke('canvFS:openRemote', null)).rejects.toThrow(/invalid target/)
    })

    it('error: malformed URL → parseTarget throws', async () => {
      // Missing :path
      await expect(ipcMain.invoke('canvFS:openRemote', 'just-a-host')).rejects.toThrow(/missing :path/)
    })

    it('happy: valid target → preflight passes, workspace set to remote', async () => {
      // The service captured `SshPool` and `RemoteFs` by destructuring at
      // import time, so we cannot replace the constructors. Instead, spy on
      // their prototypes: `SshPool.prototype.exec` is called for the preflight
      // probe, and `RemoteFs.prototype.subscribe` is invoked after the pool
      // connects. The constructors themselves are pure (no network I/O), so
      // letting them run is safe.
      vi.spyOn(sshPoolMod.SshPool.prototype, 'exec').mockResolvedValue({
        stdout: '/usr/bin/inotifywait\n/usr/bin/git\nLinux\n',
        stderr: '',
        code: 0,
      })
      vi.spyOn(sshPoolMod.SshPool.prototype, 'close').mockResolvedValue(undefined)
      vi.spyOn(remoteFsMod.RemoteFs.prototype, 'subscribe').mockReturnValue(() => {})

      const setWs = vi.fn()
      const closeWs = vi.fn(async () => {})
      const recordRemote = vi.fn()
      const ipc = makeIpcMain()
      svc.registerIpcHandlers(ipc, baseDeps(root, {
        setWorkspace: setWs,
        closeWorkspace: closeWs,
        getMainWindow: () => null,
        getRecentRemotes: () => ({ list: () => [], record: recordRemote }),
      }))
      const r = await ipc.invoke('canvFS:openRemote', 'me@host:/srv/notes')
      expect(r.kind).toBe('remote')
      expect(r.display).toMatch(/me@host:\/srv\/notes/)
      expect(setWs).toHaveBeenCalledWith(expect.objectContaining({ kind: 'remote' }))
      expect(recordRemote).toHaveBeenCalledWith('me@host:/srv/notes')
    })
  })

  describe('canvFS:reconnect', () => {
    it('happy: remote workspace → calls pool.reconnectNow', async () => {
      const reconnectNow = vi.fn()
      const ipc = makeIpcMain()
      svc.registerIpcHandlers(ipc, baseDeps(root, {
        getWorkspace: () => ({ kind: 'remote', pool: { reconnectNow } }),
      }))
      await ipc.invoke('canvFS:reconnect')
      expect(reconnectNow).toHaveBeenCalledTimes(1)
    })

    it('error: local workspace → no-op (does not throw)', async () => {
      await expect(ipcMain.invoke('canvFS:reconnect')).resolves.toBeUndefined()
    })
  })
})
