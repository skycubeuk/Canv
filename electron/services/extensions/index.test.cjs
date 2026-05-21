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

  // ---------------------------------------------------------------------------
  // Listing + reading handlers (no side-effects beyond the workspace registry
  // and on-disk extension dir).
  // ---------------------------------------------------------------------------

  describe('canvExtensions:listInstalled', () => {
    it('happy: returns the workspace registry entries', async () => {
      await installFixture(state, { id: 'ext-a' })
      await installFixture(state, { id: 'ext-b' })
      const r = await state.ipcMain.invoke('canvExtensions:listInstalled')
      expect(Array.isArray(r)).toBe(true)
      expect(r.map((e) => e.id).sort()).toEqual(['ext-a', 'ext-b'])
    })

    it('error: no workspace registry → returns empty array', async () => {
      const ipc = makeIpcMain()
      svc.registerIpcHandlers(ipc, baseDeps(state, {
        getWorkspaceRegistry: () => null,
      }))
      const r = await ipc.invoke('canvExtensions:listInstalled')
      expect(r).toEqual([])
    })
  })

  describe('canvExtensions:getFileHandlerDefaults', () => {
    it('happy: returns persisted defaults map', async () => {
      const dir = path.join(state.root, '.canv', 'extensions')
      await fsp.mkdir(dir, { recursive: true })
      await fsp.writeFile(
        path.join(dir, 'file-handlers.json'),
        JSON.stringify({ version: 1, defaults: { '.pdf': 'pdf-viewer' } }),
      )
      const r = await state.ipcMain.invoke('canvExtensions:getFileHandlerDefaults')
      expect(r).toEqual({ '.pdf': 'pdf-viewer' })
    })

    it('error: no local workspace → returns empty object', async () => {
      const ipc = makeIpcMain()
      svc.registerIpcHandlers(ipc, baseDeps(state, {
        getWorkspace: () => null,
      }))
      const r = await ipc.invoke('canvExtensions:getFileHandlerDefaults')
      expect(r).toEqual({})
    })
  })

  describe('canvExtensions:setFileHandlerDefault', () => {
    it('happy: persists the new default and returns ok', async () => {
      const r = await state.ipcMain.invoke(
        'canvExtensions:setFileHandlerDefault',
        '.pdf',
        'pdf-viewer',
      )
      expect(r).toEqual({ ok: true })
      const file = path.join(state.root, '.canv', 'extensions', 'file-handlers.json')
      const parsed = JSON.parse(await fsp.readFile(file, 'utf-8'))
      expect(parsed.defaults['.pdf']).toBe('pdf-viewer')
    })

    it('error: no local workspace → returns ok:false (no write)', async () => {
      const ipc = makeIpcMain()
      svc.registerIpcHandlers(ipc, baseDeps(state, {
        getWorkspace: () => null,
      }))
      const r = await ipc.invoke('canvExtensions:setFileHandlerDefault', '.pdf', 'p')
      expect(r).toEqual({ ok: false })
    })
  })

  describe('canvExtensions:readAllContributions', () => {
    it('happy: trusted workspace → returns merged contributions', async () => {
      const { id } = await installFixture(state, {
        id: 'with-panel',
        contributions: [
          { type: 'panel', id: 'main', title: 'M', icon: 'i', location: 'left-sidebar', entry: 'main.html' },
        ],
      })
      state.registry.setEnabled(id, true)
      state.registry.setTrustedAt(id, new Date().toISOString())
      state.trustStore.set(state.root, 'trusted')
      const r = await state.ipcMain.invoke('canvExtensions:readAllContributions')
      expect(r.panels.length).toBe(1)
      expect(r.panels[0].extensionId).toBe('with-panel')
    })

    it('error: workspace not trusted → returns EMPTY contributions', async () => {
      await installFixture(state)
      // Trust store defaults to 'untrusted'.
      const r = await state.ipcMain.invoke('canvExtensions:readAllContributions')
      expect(r.panels).toEqual([])
      expect(r.fileHandlers).toEqual([])
      expect(r.commands).toEqual([])
    })
  })

  describe('canvExtensions:previewInstall', () => {
    it('happy: folder source with valid manifest → returns parsed manifest', async () => {
      const src = await fsp.mkdtemp(path.join(os.tmpdir(), 'ext-src-'))
      try {
        await fsp.writeFile(path.join(src, 'manifest.json'), JSON.stringify({
          id: 'preview-ext',
          name: 'Preview',
          version: '1.0.0',
          engines: { canv: '^1.0.0' },
          description: 'p',
          author: 'a',
          capabilities: ['storage'],
          contributions: [
            { type: 'panel', id: 'main', title: 'M', icon: 'i', location: 'left-sidebar', entry: 'main.html' },
          ],
        }))
        const r = await state.ipcMain.invoke('canvExtensions:previewInstall', src)
        expect(r.ok).toBe(true)
        expect(r.manifest.id).toBe('preview-ext')
      } finally {
        await fsp.rm(src, { recursive: true, force: true })
      }
    })

    it('happy: .canvext zip source → unpacks and returns manifest', async () => {
      const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'ext-zip-'))
      try {
        const zip = new AdmZip()
        zip.addFile('manifest.json', Buffer.from(JSON.stringify({
          id: 'zip-ext',
          name: 'Zip',
          version: '1.0.0',
          engines: { canv: '^1.0.0' },
          description: 'z',
          author: 'a',
          capabilities: ['storage'],
          contributions: [
            { type: 'panel', id: 'main', title: 'M', icon: 'i', location: 'left-sidebar', entry: 'main.html' },
          ],
        })))
        const zipPath = path.join(tmp, 'ext.canvext')
        zip.writeZip(zipPath)
        const r = await state.ipcMain.invoke('canvExtensions:previewInstall', zipPath)
        expect(r.ok).toBe(true)
        expect(r.manifest.id).toBe('zip-ext')
      } finally {
        await fsp.rm(tmp, { recursive: true, force: true })
      }
    })

    it('error: missing source path → returns ok:false with errors', async () => {
      const r = await state.ipcMain.invoke(
        'canvExtensions:previewInstall',
        path.join(os.tmpdir(), 'no-such-' + Date.now()),
      )
      expect(r.ok).toBe(false)
      expect(r.errors[0]).toMatch(/source not found/)
    })

    it('error: corrupt manifest → returns ok:false with validation errors', async () => {
      const src = await fsp.mkdtemp(path.join(os.tmpdir(), 'ext-src-'))
      try {
        await fsp.writeFile(path.join(src, 'manifest.json'), '{"id":"bad"}')
        const r = await state.ipcMain.invoke('canvExtensions:previewInstall', src)
        expect(r.ok).toBe(false)
        expect(r.errors.length).toBeGreaterThan(0)
      } finally {
        await fsp.rm(src, { recursive: true, force: true })
      }
    })
  })

  describe('canvExtensions:readSettings', () => {
    it('happy: returns parsed settings.json for installed extension', async () => {
      const { id, dir } = await installFixture(state)
      await fsp.writeFile(path.join(dir, 'settings.json'), JSON.stringify({ greeting: 'hi' }))
      const r = await state.ipcMain.invoke('canvExtensions:readSettings', id)
      expect(r).toEqual({ greeting: 'hi' })
    })

    it('error: settings file absent → returns empty object (handler swallows ENOENT)', async () => {
      const { id } = await installFixture(state)
      const r = await state.ipcMain.invoke('canvExtensions:readSettings', id)
      expect(r).toEqual({})
    })
  })

  describe('canvExtensions:readManifest', () => {
    it('happy: returns the on-disk manifest JSON', async () => {
      const { id } = await installFixture(state, { id: 'rd-ext' })
      const r = await state.ipcMain.invoke('canvExtensions:readManifest', id)
      expect(r.id).toBe('rd-ext')
      expect(r.version).toBe('1.0.0')
    })

    it('error: manifest missing → throws ENOENT', async () => {
      await expect(state.ipcMain.invoke('canvExtensions:readManifest', 'ghost'))
        .rejects.toThrow(/ENOENT|no such file|cannot find the file/i)
    })
  })

  describe('canvExtensions:listFiles', () => {
    it('happy: walks extension dir and returns sorted relative paths', async () => {
      const { id, dir } = await installFixture(state, { id: 'lf-ext' })
      await fsp.mkdir(path.join(dir, 'panels'), { recursive: true })
      await fsp.writeFile(path.join(dir, 'panels', 'main.html'), '<x/>')
      await fsp.writeFile(path.join(dir, 'index.js'), '/* */')
      const r = await state.ipcMain.invoke('canvExtensions:listFiles', id)
      expect(r).toContain('manifest.json')
      expect(r).toContain('index.js')
      expect(r).toContain('panels/main.html')
      // Sorted.
      const sorted = [...r].sort()
      expect(r).toEqual(sorted)
    })

    it('error: extension dir missing → returns empty array (walk swallows)', async () => {
      const r = await state.ipcMain.invoke('canvExtensions:listFiles', 'never-installed')
      expect(r).toEqual([])
    })
  })

  describe('canvExtensions:readFile', () => {
    it('happy: returns text contents of a file under the extension dir', async () => {
      const { id, dir } = await installFixture(state, { id: 'rf-ext' })
      await fsp.writeFile(path.join(dir, 'note.txt'), 'hello\n')
      const r = await state.ipcMain.invoke('canvExtensions:readFile', id, 'note.txt')
      expect(r).toBe('hello\n')
    })

    it('error: path traversal in rel → throws "invalid path"', async () => {
      const { id } = await installFixture(state)
      await expect(state.ipcMain.invoke('canvExtensions:readFile', id, '../../etc/passwd'))
        .rejects.toThrow(/invalid path/)
    })

    it('error: target missing → throws ENOENT', async () => {
      const { id } = await installFixture(state)
      await expect(state.ipcMain.invoke('canvExtensions:readFile', id, 'nope.txt'))
        .rejects.toThrow(/ENOENT|no such file|cannot find the file/i)
    })
  })

  // ---------------------------------------------------------------------------
  // Install / uninstall / setEnabled / trust handlers. spawn() calls are
  // suppressed via a prototype spy on ExtensionRuntime so we never touch
  // WebContentsView. destroy() is also spied because some setEnabled paths
  // tear down running extensions.
  // ---------------------------------------------------------------------------

  describe('canvExtensions:install', () => {
    it('happy: folder source → copies tree, registers, returns ok:true', async () => {
      const src = await fsp.mkdtemp(path.join(os.tmpdir(), 'ext-install-src-'))
      try {
        await fsp.writeFile(path.join(src, 'manifest.json'), JSON.stringify({
          id: 'inst-folder', name: 'F', version: '1.0.0',
          engines: { canv: '^1.0.0' }, description: 'd', author: 'a',
          capabilities: ['storage'],
          contributions: [
            { type: 'panel', id: 'main', title: 'M', icon: 'i', location: 'left-sidebar', entry: 'panels/main.html' },
          ],
        }))
        await fsp.mkdir(path.join(src, 'panels'), { recursive: true })
        await fsp.writeFile(path.join(src, 'panels', 'main.html'), '<x/>')
        const r = await state.ipcMain.invoke('canvExtensions:install', src)
        expect(r).toEqual({ ok: true, id: 'inst-folder' })
        const target = path.join(state.root, '.canv', 'extensions', 'inst-folder')
        expect(fs.existsSync(path.join(target, 'manifest.json'))).toBe(true)
        expect(fs.existsSync(path.join(target, 'panels', 'main.html'))).toBe(true)
        // Registry now records the install.
        expect(state.registry.get('inst-folder')).toBeTruthy()
      } finally {
        await fsp.rm(src, { recursive: true, force: true })
      }
    })

    it('happy: .canvext zip source → unpacks, copies, registers', async () => {
      const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'ext-install-zip-'))
      try {
        const zip = new AdmZip()
        zip.addFile('manifest.json', Buffer.from(JSON.stringify({
          id: 'inst-zip', name: 'Z', version: '1.0.0',
          engines: { canv: '^1.0.0' }, description: 'd', author: 'a',
          capabilities: ['storage'],
          contributions: [
            { type: 'panel', id: 'main', title: 'M', icon: 'i', location: 'left-sidebar', entry: 'index.html' },
          ],
        })))
        zip.addFile('index.html', Buffer.from('<x/>'))
        const zipPath = path.join(tmp, 'ext.canvext')
        zip.writeZip(zipPath)
        const r = await state.ipcMain.invoke('canvExtensions:install', zipPath)
        expect(r).toEqual({ ok: true, id: 'inst-zip' })
        expect(state.registry.get('inst-zip')).toBeTruthy()
      } finally {
        await fsp.rm(tmp, { recursive: true, force: true })
      }
    })

    it('error: invalid manifest → returns ok:false with validation errors', async () => {
      const src = await fsp.mkdtemp(path.join(os.tmpdir(), 'ext-install-bad-'))
      try {
        await fsp.writeFile(path.join(src, 'manifest.json'), '{"id":"x"}')
        const r = await state.ipcMain.invoke('canvExtensions:install', src)
        expect(r.ok).toBe(false)
        expect(r.errors.length).toBeGreaterThan(0)
      } finally {
        await fsp.rm(src, { recursive: true, force: true })
      }
    })

    it('error: missing source → returns ok:false', async () => {
      const r = await state.ipcMain.invoke('canvExtensions:install',
        path.join(os.tmpdir(), 'no-such-' + Date.now()))
      expect(r.ok).toBe(false)
      expect(r.errors[0]).toMatch(/source not found/)
    })
  })

  describe('canvExtensions:uninstall', () => {
    it('happy: removes from registry and deletes the extension dir', async () => {
      const { id, dir } = await installFixture(state, { id: 'uninst-me' })
      // Sanity: dir is present.
      expect(fs.existsSync(dir)).toBe(true)
      await state.ipcMain.invoke('canvExtensions:uninstall', id)
      expect(state.registry.get(id)).toBeNull()
      expect(fs.existsSync(dir)).toBe(false)
    })

    it('error: no workspace registry → throws "no workspace open"', async () => {
      const ipc = makeIpcMain()
      svc.registerIpcHandlers(ipc, baseDeps(state, {
        getWorkspaceRegistry: () => null,
      }))
      await expect(ipc.invoke('canvExtensions:uninstall', 'x'))
        .rejects.toThrow(/no workspace open/)
    })
  })

  describe('canvExtensions:setEnabled', () => {
    it('happy: flips enabled flag in the registry', async () => {
      const { id } = await installFixture(state, { id: 'se-ext' })
      expect(state.registry.get(id).enabled).toBe(false)
      // Untrusted + workspace untrusted → setEnabled won't try to spawn.
      await state.ipcMain.invoke('canvExtensions:setEnabled', id, true)
      expect(state.registry.get(id).enabled).toBe(true)
      await state.ipcMain.invoke('canvExtensions:setEnabled', id, false)
      expect(state.registry.get(id).enabled).toBe(false)
    })

    it('error: no workspace registry → throws "no workspace open"', async () => {
      const ipc = makeIpcMain()
      svc.registerIpcHandlers(ipc, baseDeps(state, {
        getWorkspaceRegistry: () => null,
      }))
      await expect(ipc.invoke('canvExtensions:setEnabled', 'x', true))
        .rejects.toThrow(/no workspace open/)
    })
  })

  describe('canvExtensions:setTrustedAt', () => {
    it('happy: stores the provided ISO timestamp', async () => {
      const { id } = await installFixture(state, { id: 'tr-ext' })
      const iso = '2026-01-01T00:00:00.000Z'
      await state.ipcMain.invoke('canvExtensions:setTrustedAt', id, iso)
      expect(state.registry.get(id).trustedAt).toBe(iso)
    })

    it('happy: null clears the trust timestamp', async () => {
      const { id } = await installFixture(state, { id: 'tr-clear' })
      state.registry.setTrustedAt(id, '2026-01-01T00:00:00.000Z')
      await state.ipcMain.invoke('canvExtensions:setTrustedAt', id, null)
      expect(state.registry.get(id).trustedAt).toBeNull()
    })

    it('error: no workspace registry → throws "no workspace open"', async () => {
      const ipc = makeIpcMain()
      svc.registerIpcHandlers(ipc, baseDeps(state, {
        getWorkspaceRegistry: () => null,
      }))
      await expect(ipc.invoke('canvExtensions:setTrustedAt', 'x', null))
        .rejects.toThrow(/no workspace open/)
    })
  })

  describe('canvExtensions:getWorkspaceTrust', () => {
    it('happy: returns the trust-store state for the current workspace', async () => {
      state.trustStore.set(state.root, 'trusted')
      const r = await state.ipcMain.invoke('canvExtensions:getWorkspaceTrust')
      expect(r).toBe('trusted')
    })

    it('error: no local workspace → returns "untrusted"', async () => {
      const ipc = makeIpcMain()
      svc.registerIpcHandlers(ipc, baseDeps(state, {
        getWorkspace: () => null,
      }))
      const r = await ipc.invoke('canvExtensions:getWorkspaceTrust')
      expect(r).toBe('untrusted')
    })
  })

  describe('canvExtensions:setWorkspaceTrust', () => {
    it('happy: persists the new trust state', async () => {
      await state.ipcMain.invoke('canvExtensions:setWorkspaceTrust', 'trusted')
      expect(state.trustStore.stateFor(state.root)).toBe('trusted')
    })

    it('happy: revoking trust destroys any running extensions', async () => {
      // Populate the runtime with one fake "running" extension and spy on destroy.
      state.runtime._byId.set('running', {
        manifest: { id: 'running' }, extensionDir: '/x',
        webContentsId: 99, view: null, storage: null, subscriptions: new Set(),
      })
      const destroySpy = vi.spyOn(state.runtime, 'destroy').mockResolvedValue(undefined)
      await state.ipcMain.invoke('canvExtensions:setWorkspaceTrust', 'untrusted')
      expect(destroySpy).toHaveBeenCalledWith('running')
    })

    it('error: no local workspace → throws "no local workspace"', async () => {
      const ipc = makeIpcMain()
      svc.registerIpcHandlers(ipc, baseDeps(state, {
        getWorkspace: () => null,
      }))
      await expect(ipc.invoke('canvExtensions:setWorkspaceTrust', 'trusted'))
        .rejects.toThrow(/no local workspace/)
    })
  })
})
