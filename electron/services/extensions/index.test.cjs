'use strict'
// describe/it/expect/beforeEach/afterEach/vi are injected by vitest globals.
//
// Integration tests for the extensions service IPC handlers
// (electron/services/extensions/index.cjs). Mirrors the per-file template
// established in electron/services/fs/index.test.cjs:
//   - replace require.cache for 'electron' with a hand-built stub BEFORE
//     loading the service (vi.mock does not hoist in CJS)
//   - prototype-spy on ExtensionRuntime methods to suppress real
//     WebContentsView creation (the spawn() path needs Electron internals
//     that aren't available outside a packaged main process)
//   - use a real on-disk Registry under <root>/.canv/extensions
//   - mkdtemp workspace + fsp.rm cleanup + vi.restoreAllMocks in afterEach

const Module = require('node:module')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const AdmZip = require('adm-zip')

// ---------------------------------------------------------------------------
// Electron stub. The extensions service references many electron surfaces:
//   app.getPath / app.isPackaged / dialog.showOpenDialog / shell / clipboard
//   protocol.handle (registerProtocol() calls this at registerIpcHandlers
//                    time — must be present)
//   webContents.fromId / BrowserWindow.fromWebContents / WebContentsView
//   nativeTheme (unused but imported transitively by fs-limits/etc.)
// app.isPackaged is a settable property so tests can flip dev/prod.
// ---------------------------------------------------------------------------
const electronPath = require.resolve('electron')
const electron = {
  app: {
    getPath: () => os.tmpdir(),
    isPackaged: false,
  },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showMessageBox: async () => ({ response: 0 }),
  },
  shell: { openPath: async () => '', trashItem: async () => undefined },
  clipboard: { writeText: () => {} },
  BrowserWindow: class {
    static fromWebContents() { return null }
  },
  WebContentsView: class {},
  webContents: { fromId: () => null },
  nativeTheme: {},
  // registerProtocol() calls protocol.handle once during registerIpcHandlers.
  // The stub records calls so tests can inspect them if needed.
  protocol: { handle: () => {} },
}
{
  const m = new Module(electronPath)
  m.filename = electronPath
  m.loaded = true
  m.exports = electron
  require.cache[electronPath] = m
}

// Load the service AFTER the electron stub is in place. Also pull the
// ExtensionRuntime so we can prototype-spy on it inside individual tests.
const runtimeMod = require('../../extensions/runtime.cjs')
const { Registry } = require('../../extensions/registry.cjs')
const activity = require('../../extensions/activity.cjs')
const svc = require('./index.cjs')

function makeIpcMain() {
  const handlers = new Map()
  const onListeners = new Map()
  return {
    handle(name, fn) { handlers.set(name, fn) },
    async invoke(name, ...args) {
      const fn = handlers.get(name)
      if (!fn) throw new Error(`no handler: ${name}`)
      return fn({ sender: { id: 1 } }, ...args)
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
    _hasHandler(name) { return handlers.has(name) },
    _hasListener(name) { return (onListeners.get(name) ?? []).length > 0 },
  }
}

// Per-test state holder: each beforeEach builds a fresh workspace root,
// a fresh Registry on disk, a fresh trust-store-target path under userData,
// and a fresh ipcMain. Tests override `deps.*` getters as needed.
function baseDeps(state, overrides = {}) {
  return {
    getWorkspace: () => ({ kind: 'local', root: state.root }),
    getMainWindow: () => state.mainWindow,
    getWorkspaceRegistry: () => state.registry,
    getExtensionRuntime: () => state.runtime,
    setExtensionRuntime: (r) => { state.runtime = r },
    getTrustStore: () => state.trustStore,
    setTrustStore: (s) => { state.trustStore = s },
    safeResolve: (root, rel) => {
      const abs = path.resolve(root, rel)
      if (!abs.startsWith(root + path.sep) && abs !== root) {
        throw new Error('path outside workspace')
      }
      return abs
    },
    invalidateExtensionClaimedExts: () => {},
    buildTree: async () => [],
    getWatcher: () => null,
    setExtensionWorkspaceContainsRefresh: () => {},
    getMcpService: () => null,
    ...overrides,
  }
}

// Build a minimal valid manifest under <root>/.canv/extensions/<id>/
// and register it with the Registry. Returns the entry from the registry.
async function installFixture(state, manifestOverrides = {}) {
  const id = manifestOverrides.id || 'test-ext'
  const manifest = {
    id,
    name: 'Test Extension',
    version: '1.0.0',
    engines: { canv: '^1.0.0' },
    description: 'fixture',
    author: 'test',
    capabilities: ['storage'],
    contributions: [],
    ...manifestOverrides,
  }
  const dir = path.join(state.root, '.canv', 'extensions', id)
  await fsp.mkdir(dir, { recursive: true })
  await fsp.writeFile(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  // Use the real hash so spawnInstalled tamper-check passes when needed.
  const { hashExtensionDir } = require('../../extensions/manifest-hash.cjs')
  const hash = await hashExtensionDir(dir)
  state.registry.install(manifest, hash)
  return { id, manifest, dir, hash }
}

describe('extensions service IPC handlers', () => {
  let state

  beforeEach(async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'ext-svc-'))
    const userData = await fsp.mkdtemp(path.join(os.tmpdir(), 'ext-userdata-'))
    // Trust file lives at <userData>/Canv/trusted-workspaces.json — ensure
    // userData is fresh for every test so trust state is deterministic.
    vi.spyOn(electron.app, 'getPath').mockReturnValue(userData)
    // Default: dev mode (so dev-only handlers register).
    electron.app.isPackaged = false

    const registry = new Registry(root)
    const ipcMain = makeIpcMain()
    state = { root, userData, registry, ipcMain, mainWindow: null, runtime: null, trustStore: null }
    // activity counters are module-global; reset between tests.
    activity._resetAllForTest()
    state.ipcMain = ipcMain
    state.deps = baseDeps(state)
    svc.registerIpcHandlers(ipcMain, state.deps)
  })

  afterEach(async () => {
    await fsp.rm(state.root, { recursive: true, force: true })
    await fsp.rm(state.userData, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('registers IPC handlers without throwing', () => {
    expect(typeof state.ipcMain.invoke).toBe('function')
    expect(state.ipcMain._hasHandler('canvExtensions:listInstalled')).toBe(true)
  })
})
