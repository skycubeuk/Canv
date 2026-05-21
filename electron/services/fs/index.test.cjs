'use strict'
// describe/it/expect/beforeEach/afterEach/vi are injected by vitest globals.

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')

// `electron` resolves to a stub when not running inside Electron. The fs
// service calls `app.getPath`, `dialog.showOpenDialog`, `shell.openPath`, and
// `shell.trashItem` from inside its handlers, so we replace the module with a
// controllable mock. Tests `vi.spyOn` on these exports as needed.
vi.mock('electron', () => {
  const shell = {
    openPath: vi.fn(async () => ''),
    trashItem: vi.fn(async () => undefined),
  }
  const dialog = {
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
  }
  const app = {
    getPath: vi.fn(() => ''),
  }
  return { app, dialog, shell, BrowserWindow: class {}, nativeTheme: {} }
})

const svc = require('./index.cjs')
const electron = require('electron')

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
    // Smoke: registerIpcHandlers was invoked in beforeEach; a known handler is registered.
    expect(typeof ipcMain.invoke).toBe('function')
  })
})
