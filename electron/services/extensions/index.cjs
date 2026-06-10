'use strict'

const electron = require('electron')
const { app, BrowserWindow, dialog } = electron
const path = require('node:path')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const { execFile } = require('node:child_process')
const AdmZip = require('adm-zip')

const MAX_CANVEXT_BYTES = 50 * 1024 * 1024

function unpackCanvext(srcZip, destDir) {
  const zip = new AdmZip(srcZip)
  let total = 0
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    const norm = path.normalize(entry.entryName)
    // Zip-slip guard: refuse entries that resolve outside destDir.
    const abs = path.resolve(destDir, norm)
    const root = path.resolve(destDir)
    if (!abs.startsWith(root + path.sep) && abs !== root) {
      throw new Error(`refused entry escaping destDir: ${entry.entryName}`)
    }
    total += entry.header.size
    if (total > MAX_CANVEXT_BYTES) {
      throw new Error(`canvext uncompressed size exceeds ${MAX_CANVEXT_BYTES} bytes`)
    }
  }
  zip.extractAllTo(destDir, true)
}

const { ExtensionRuntime } = require('../../extensions/runtime.cjs')
const { registerProtocol } = require('../../extensions/protocol.cjs')
const activationEventsLib = require('../../extensions/activation-events.cjs')
const { createWorkspaceContainsEvaluator } = require('./workspace-contains.cjs')
const { createActiveDocHandlers } = require('../../extensions/handlers/active-doc.cjs')
const { createWorkspaceHandlers } = require('../../extensions/handlers/workspace.cjs')
const { createEventsHandlers } = require('../../extensions/handlers/events.cjs')
const { createStorageHandlers } = require('../../extensions/handlers/storage.cjs')
const { createUiHandlers } = require('../../extensions/handlers/ui.cjs')
const { validateManifest } = require('../../extensions/manifest-schema.cjs')
const { WorkspaceTrustStore } = require('../../extensions/workspace-trust.cjs')
const { MAX_OPEN_BYTES } = require('../fs-limits.cjs')
const { hashExtensionDir } = require('../../extensions/manifest-hash.cjs')
const { shouldActivateFor } = require('../../extensions/activation-events.cjs')
const { createSettingsHandlers } = require('../../extensions/handlers/settings.cjs')
const { createAiHandlers } = require('../../extensions/handlers/ai.cjs')
const { createNetHandlers } = require('../../extensions/handlers/net.cjs')
const { createUiPromptHandlers } = require('../../extensions/handlers/ui-prompt.cjs')
const { createStatusBarHandlers } = require('../../extensions/handlers/statusBar.cjs')
const { createMcpHandlers } = require('../../extensions/handlers/mcp.cjs')
const { createProcessHandlers } = require('../../extensions/handlers/process.cjs')
const { createExecWrite } = require('./exec-write.cjs')
const activity = require('../../extensions/activity.cjs')
const { buildAllContributions, EMPTY: EMPTY_CONTRIBS } = require('../../extensions/contributions.cjs')
const { readDefaults: readFileHandlerDefaults, writeDefault: writeFileHandlerDefault } = require('../../extensions/file-handler-defaults.cjs')

const EXTENSIONS_TEST_FIXTURES_DIR = path.join(__dirname, '..', '..', 'extensions', 'test-fixtures')
const EXTENSIONS_SHARED_DIR = path.join(__dirname, '..', '..', 'extensions', 'shared-assets')
const EXTENSION_PRELOAD_PATH = path.join(__dirname, '..', '..', 'extensions', 'extension-preload.cjs')

// Extension-scoped state. Only extension handlers read these maps, so they
// live with the handlers rather than in main.cjs.
const pendingPrompts = new Map()    // reqId → { resolve, reject }
const statusBarOverrides = new Map() // key: '<extensionId>:<itemId>' → { text?, icon?, tooltip? }
// Phase 5b: tracks the file each fileHandler-spawned extension is showing,
// so canv.activeDoc.getBytes/setBytes know which path to operate on.
const extensionActiveFile = new Map() // extensionId → { relPath, absPath, mode }
let nextPromptId = 1

/**
 * extensions IPC handlers. Called once at app.whenReady from electron/main.cjs.
 *
 * Owns:
 *   - the ExtensionRuntime instance (created here, exposed via deps.setExtensionRuntime)
 *   - the WorkspaceTrustStore (created here, exposed via deps.setTrustStore)
 *   - the canv-extension protocol registration
 *   - buildExtensionHost / requestFromRenderer (the renderer-RPC bridge used by
 *     the active-doc + ui + ai + statusBar handlers)
 *   - 42 IPC handlers across three channel prefixes:
 *       canvExtensions:*  (37 handlers)
 *       canvExtHost:*     (1 listener — the reply side; the request side is a send)
 *       canvExtDev:*      (4 handlers, dev-only, gated on !app.isPackaged)
 *
 * The `deps` object exposes getters for module-scoped state in main.cjs
 * (live values, since workspaces switch at runtime) and shared utilities.
 */
function registerIpcHandlers(ipcMain, deps) {
  const {
    getWorkspace,
    getMainWindow,
    getWorkspaceRegistry,
    getExtensionRuntime,
    setExtensionRuntime,
    getTrustStore,
    setTrustStore,
    safeResolve,
    invalidateExtensionClaimedExts,
  } = deps

  // ---------- buildExtensionHost ----------
  // The main window's React renderer owns the editor state. We can't query it
  // synchronously from main, so the renderer subscribes to a tiny request/reply
  // channel; main calls `requestFromRenderer(method, args)` and resolves when
  // the reply arrives. Phase 1 uses this only for active-doc state.
  let nextReqId = 1
  const pending = new Map()

  ipcMain.on('canvExtHost:reply', (_e, reqId, ok, payload) => {
    const p = pending.get(reqId)
    if (!p) return
    pending.delete(reqId)
    if (ok) p.resolve(payload); else p.reject(new Error(payload))
  })

  function requestFromRenderer(method, args, timeoutMs = 5000) {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return Promise.reject(new Error('main window closed'))
    const id = nextReqId++
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      mainWindow.webContents.send('canvExtHost:request', id, method, args)
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id)
          reject(new Error(`extension host request "${method}" timed out`))
        }
      }, timeoutMs)
    })
  }

  function workspaceRootOrLocalThrow() {
    const ws = getWorkspace()
    if (!ws || ws.kind !== 'local') throw new Error('no local workspace open')
    return ws.root
  }

  async function buildTreeForHost(root, relDir) {
    // Defer to deps.buildTree so we use the canonical tree builder with all
    // the FS-bridge limits/filters.
    return deps.buildTree(root, relDir || '', 0)
  }

  const host = {
    // activeDoc
    getActiveDocText:      () => requestFromRenderer('activeDoc.getText', []),
    getActiveDocPath:      () => requestFromRenderer('activeDoc.getPath', []),
    getActiveDocSelection: () => requestFromRenderer('activeDoc.getSelection', []),
    insertAtCursor:        (text) => requestFromRenderer('activeDoc.insertAtCursor', [text]),
    replaceSelection:      (text) => requestFromRenderer('activeDoc.replaceSelection', [text]),
    setActiveDocText:      (text) => requestFromRenderer('activeDoc.setText', [text]),

    // workspace
    getWorkspaceRoot:  async () => workspaceRootOrLocalThrow(),
    listWorkspace:     async (globOrDir) => {
      const root = workspaceRootOrLocalThrow()
      return buildTreeForHost(root, globOrDir || '')
    },
    readWorkspaceText: async (rel) => {
      const root = workspaceRootOrLocalThrow()
      const abs = safeResolve(root, rel)
      const stat = await fsp.stat(abs)
      if (!stat.isFile()) throw new Error('not a file')
      if (stat.size > MAX_OPEN_BYTES) throw new Error('file too large')
      return fsp.readFile(abs, 'utf-8')
    },
    // writeWorkspaceText (workspace.write) + execAllowed (process) live in a
    // testable factory; see exec-write.cjs / exec-write.test.cjs.
    ...createExecWrite({ getRoot: workspaceRootOrLocalThrow, safeResolve, fsp, execFile }),

    // ui
    notifyToMainWindow: (msg, kind, extensionId) => {
      const mainWindow = getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('canvExt:notification', { message: msg, kind, extensionId })
      }
    },
    showConfirmDialog: async (msg) => {
      const mainWindow = getMainWindow()
      if (!mainWindow) return false
      const r = await dialog.showMessageBox(mainWindow, {
        type: 'question', buttons: ['Cancel', 'OK'], defaultId: 1, cancelId: 0,
        message: msg,
      })
      return r.response === 1
    },
    writeClipboard: (text) => electron.clipboard.writeText(text),

    askAI: async (params) => {
      const result = await requestFromRenderer('ai.ask', [params], 60 * 1000)  // 60s for AI calls
      activity.recordAi(params.extensionId, result?.usage)
      return result
    },

    showPrompt: (req) => new Promise((resolve, reject) => {
      const mainWindow = getMainWindow()
      if (!mainWindow || mainWindow.isDestroyed()) return reject(new Error('main window closed'))
      const reqId = nextPromptId++
      pendingPrompts.set(reqId, { resolve, reject })
      mainWindow.webContents.send('canvExtensions:promptRequest', reqId, req)
      // No timeout — user might take their time.
    }),

    getActiveFileFor: (extensionId) => extensionActiveFile.get(extensionId) ?? null,

    onStatusBarItemUpdated: (itemId, payload) => {
      const key = `${payload.extensionId}:${itemId}`
      const existing = statusBarOverrides.get(key) || {}
      const next = { ...existing }
      if ('text' in payload) next.text = payload.text
      if ('icon' in payload) next.icon = payload.icon
      if ('tooltip' in payload) next.tooltip = payload.tooltip
      statusBarOverrides.set(key, next)
      const mainWindow = getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('canvExtensions:statusBarChanged', { extensionId: payload.extensionId, itemId, ...next })
      }
    },
  }

  // ---------- Construct ExtensionRuntime + WorkspaceTrustStore ----------
  const extensionRuntime = new ExtensionRuntime({
    electron: { WebContentsView: electron.WebContentsView },
    extensionPreloadPath: EXTENSION_PRELOAD_PATH,
    openDevToolsOnSpawn: !app.isPackaged,
    eventDispatcher: (webContentsId, eventType, payload) => {
      const wc = electron.webContents.fromId(webContentsId)
      if (wc && !wc.isDestroyed()) {
        wc.send('canvExt:event', { type: eventType, payload })
      }
    },
    onCrash: (id, details) => {
      const mainWindow = getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('canvExtensions:crashed', { id, reason: details?.reason ?? 'unknown' })
      }
    },
  })
  setExtensionRuntime(extensionRuntime)

  const TRUST_FILE = path.join(app.getPath('userData'), 'Canv', 'trusted-workspaces.json')
  const trustStore = new WorkspaceTrustStore(TRUST_FILE)
  setTrustStore(trustStore)

  async function copyExtensionTree(src, dst) {
    await fsp.mkdir(dst, { recursive: true })
    async function walk(s, d) {
      const entries = await fsp.readdir(s, { withFileTypes: true })
      for (const e of entries) {
        if (e.name === 'settings.json' || e.name === 'log') continue
        const sp = path.join(s, e.name)
        const dp = path.join(d, e.name)
        if (e.isDirectory()) { await fsp.mkdir(dp, { recursive: true }); await walk(sp, dp) }
        else if (e.isFile()) { await fsp.copyFile(sp, dp) }
      }
    }
    await walk(src, dst)
  }

  function onRegistryChanged() {
    invalidateExtensionClaimedExts()
    // Re-evaluate workspaceContains activation: install/uninstall/enable/trust
    // changes can add or remove extensions whose declared globs should fire.
    try { setupWorkspaceContains() } catch (e) { console.error('[workspaceContains] setup failed', e) }
    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('canvExtensions:registryChanged')
    }
  }

  // Read a workspace-installed extension's manifest from disk, validating it
  // through the same Zod schema used at install time. Returns null if the
  // workspace is missing, the file can't be parsed, OR the parsed object
  // fails schema validation (post-install hand-edits, partial upgrades,
  // etc.). Treating drifted manifests as missing protects shouldActivateFor
  // / effectiveActivationEvents from malformed input.
  function readInstalledManifestSync(id) {
    const WORKSPACE = getWorkspace()
    if (!WORKSPACE || WORKSPACE.kind !== 'local') return null
    const file = path.join(WORKSPACE.root, '.canv', 'extensions', id, 'manifest.json')
    let raw
    try { raw = JSON.parse(fs.readFileSync(file, 'utf-8')) }
    catch { return null }
    const v = validateManifest(raw)
    return v.ok ? v.manifest : null
  }

  // Per-extension in-flight spawn locks. React strict-mode and fast tab
  // switches can fire showFileInExtension twice before the first spawn
  // completes; without the lock the second call sees manifestFor still false
  // and tries to spawn again, throwing "already spawned".
  const spawnLocks = new Map()

  async function spawnInstalled(id, opts = {}) {
    const WORKSPACE = getWorkspace()
    const workspaceRegistry = getWorkspaceRegistry()
    if (!WORKSPACE || WORKSPACE.kind !== 'local') return { ok: false, reason: 'no-workspace' }
    if (!workspaceRegistry) return { ok: false, reason: 'no-registry' }
    const existing = spawnLocks.get(id)
    if (existing) return await existing
    const entry = workspaceRegistry.get(id)
    if (!entry) return { ok: false, reason: 'not-installed' }
    const promise = (async () => {
    const dir = path.join(WORKSPACE.root, '.canv', 'extensions', id)
    // Tamper detection: any spawn path (enable toggle, requestActivation,
    // reload) re-hashes the installed dir and compares to the hash recorded
    // at install time. Drift → revoke per-extension trust + disable + skip.
    const currentHash = await hashExtensionDir(dir)
    if (currentHash !== entry.manifestSha256) {
      workspaceRegistry.setTrustedAt(id, null)
      workspaceRegistry.setEnabled(id, false)
      onRegistryChanged()
      return { ok: false, reason: 'tamper-detected' }
    }
    const manifest = JSON.parse(await fsp.readFile(path.join(dir, 'manifest.json'), 'utf-8'))
    // Phase 5: panels are mounted into UI slots. Without explicit bounds, spawn
    // hidden (zero-rect). The slot's ResizeObserver reports real bounds the
    // moment the user opens the panel's tab; floating corner placement is gone.
    const bounds = opts.bounds ?? { x: 0, y: 0, width: 0, height: 0 }
    // opts.hostWindow lets a slot in the pop-out be the initial host for the
    // WebContentsView. When unset (activation events, command invocation,
    // cold-start auto-spawn), fall back to mainWindow.
    const mainWindow = getMainWindow()
    const hostWindow = opts.hostWindow && !opts.hostWindow.isDestroyed() ? opts.hostWindow : mainWindow
    try {
      await extensionRuntime.spawn({
        extensionDir: dir, manifest, hostWindow, bounds,
        entryRel: opts.entryRel,
      })
    } catch (e) {
      if (e && /engines\.canv/.test(e.message)) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('canvExtensions:engineMismatch', {
            id: manifest.id,
            message: e.message,
          })
        }
        return { ok: false, reason: 'engineMismatch' }
      }
      throw e
    }
    return { ok: true }
    })()
    spawnLocks.set(id, promise)
    try { return await promise }
    finally { spawnLocks.delete(id) }
  }

  // ------------------------------------------------------------------
  // Trigger-driven activation (workspaceContains, onUri). The runtime
  // owns the activate()/activateByUri() entrypoints; we inject the
  // registry-plus-manifest bridge + the spawn function here so the
  // runtime stays decoupled from workspace shape.
  // ------------------------------------------------------------------
  extensionRuntime.setActivationContext({
    workspaceRegistry: {
      get: (id) => {
        const reg = getWorkspaceRegistry()
        const entry = reg ? reg.get(id) : null
        if (!entry) return null
        const manifest = readInstalledManifestSync(id)
        return manifest ? { ...entry, manifest } : null
      },
    },
    activationEvents: activationEventsLib,
    spawnInstalled,
  })

  let wcEvaluator = null
  function setupWorkspaceContains() {
    if (wcEvaluator) { wcEvaluator.dispose(); wcEvaluator = null }
    const watcher = typeof deps.getWatcher === 'function' ? deps.getWatcher() : null
    const wsReg = getWorkspaceRegistry()
    const WORKSPACE = getWorkspace()
    if (!watcher || !wsReg || !WORKSPACE || WORKSPACE.kind !== 'local') return
    // Build {id, manifest} for each enabled+trusted entry so the evaluator can
    // inspect activationEvents without touching disk per file event.
    const installed = []
    for (const entry of wsReg.listEntries()) {
      if (!entry.enabled || entry.trustedAt == null) continue
      const manifest = readInstalledManifestSync(entry.id)
      if (manifest) installed.push({ id: entry.id, manifest })
    }
    wcEvaluator = createWorkspaceContainsEvaluator({
      getWorkspace,
      getInstalled: () => installed,
      runtime: extensionRuntime,
      watcher,
    })
    wcEvaluator.rebuild()
    wcEvaluator.evaluateAtOpen().catch((e) => console.error('[workspaceContains] evaluate failed', e))
  }
  // Expose for the workspace-change hook in main.cjs (wired below via deps).
  if (typeof deps.setExtensionWorkspaceContainsRefresh === 'function') {
    deps.setExtensionWorkspaceContainsRefresh(setupWorkspaceContains)
  }

  registerProtocol(electron.protocol, {
    extensionDirFor: (id) => {
      // Spawned extensions (panels, fileHandlers) know their own dir.
      const fromRuntime = extensionRuntime.extensionDirFor(id)
      if (fromRuntime) return fromRuntime
      // Installed-but-not-spawned extensions (e.g. language contributions
      // loaded into the main renderer via dynamic import) live on disk under
      // <workspace>/.canv/extensions/<id>. Allow the protocol to serve their
      // files even though no WebContentsView is running.
      const WORKSPACE = getWorkspace()
      const workspaceRegistry = getWorkspaceRegistry()
      if (WORKSPACE && WORKSPACE.kind === 'local' && workspaceRegistry) {
        const entry = workspaceRegistry.get(id)
        if (entry && entry.enabled && entry.trustedAt != null) {
          return path.join(WORKSPACE.root, '.canv', 'extensions', id)
        }
      }
      return null
    },
    sharedDir: EXTENSIONS_SHARED_DIR,
    manifestFor: (id) => {
      const fromRuntime = extensionRuntime.manifestFor(id)
      if (fromRuntime) return fromRuntime
      // Installed-but-not-spawned: read manifest from disk so the protocol
      // handler can compute a per-extension CSP for served language entries.
      const WORKSPACE = getWorkspace()
      const workspaceRegistry = getWorkspaceRegistry()
      if (WORKSPACE && WORKSPACE.kind === 'local' && workspaceRegistry) {
        const entry = workspaceRegistry.get(id)
        if (entry && entry.enabled && entry.trustedAt != null) {
          try {
            const raw = fs.readFileSync(path.join(WORKSPACE.root, '.canv', 'extensions', id, 'manifest.json'), 'utf-8')
            return JSON.parse(raw)
          } catch { /* fall through to null */ }
        }
      }
      return null
    },
  })

  // Bundle all handlers and register them with ipcMain.
  const allHandlers = {
    ...createActiveDocHandlers({ runtime: extensionRuntime, host }),
    ...createWorkspaceHandlers({ runtime: extensionRuntime, host }),
    ...createEventsHandlers({ runtime: extensionRuntime }),
    ...createStorageHandlers({ runtime: extensionRuntime }),
    ...createUiHandlers({ runtime: extensionRuntime, host }),
    ...createSettingsHandlers({
      runtime: extensionRuntime,
      settingsFileFor: (id) => path.join(getWorkspace().root, '.canv', 'extensions', id, 'settings.json'),
    }),
    ...createAiHandlers({ runtime: extensionRuntime, host }),
    ...createNetHandlers({ runtime: extensionRuntime, onRequest: (id) => activity.recordNet(id) }),
    ...createUiPromptHandlers({ runtime: extensionRuntime, host }),
    ...createStatusBarHandlers({ runtime: extensionRuntime, host }),
    ...createMcpHandlers({ runtime: extensionRuntime, getMcpService: () => (typeof deps.getMcpService === 'function' ? deps.getMcpService() : null) }),
    ...createProcessHandlers({ runtime: extensionRuntime, host }),
  }
  for (const [channel, fn] of Object.entries(allHandlers)) {
    ipcMain.handle(channel, fn)
  }

  // Prompt reply channel — renderer resolves or cancels a showPrompt() call.
  ipcMain.on('canvExtensions:promptResolve', (_e, reqId, value) => {
    const p = pendingPrompts.get(reqId)
    if (!p) return
    pendingPrompts.delete(reqId)
    p.resolve(value)   // value is null on cancel, or { value: T } for quickPick / input
  })

  // Dev-only fixture spawn handlers. Registered only in unpackaged builds so
  // a production binary cannot be told to spawn arbitrary fixture directories.
  if (!app.isPackaged) {
    ipcMain.handle('canvExtDev:spawnTest', async (_e, fixtureName, bounds) => {
      // path.basename strips any traversal segments — the fixture name must be
      // a bare directory name under EXTENSIONS_TEST_FIXTURES_DIR.
      const safeName = path.basename(String(fixtureName || ''))
      if (!safeName || safeName === '.' || safeName === '..') {
        throw new Error('invalid fixture name')
      }
      const extensionDir = path.join(EXTENSIONS_TEST_FIXTURES_DIR, safeName)
      const manifestRaw = JSON.parse(await fsp.readFile(path.join(extensionDir, 'manifest.json'), 'utf-8'))
      const v = validateManifest(manifestRaw)
      if (!v.ok) throw new Error('invalid manifest: ' + v.errors.join('; '))
      const mainWindow = getMainWindow()
      if (!mainWindow) throw new Error('no main window')
      await extensionRuntime.spawn({
        extensionDir, manifest: v.manifest, hostWindow: mainWindow,
        bounds: bounds || { x: 1000, y: 80, width: 360, height: 600 },
      })
      return { ok: true, id: v.manifest.id }
    })
    ipcMain.handle('canvExtDev:destroyTest', async (_e, id) => {
      if (!extensionRuntime) return
      await extensionRuntime.destroy(id)
    })
    ipcMain.handle('canvExtDev:setBounds', async (_e, id, bounds) => {
      if (!extensionRuntime) return
      extensionRuntime.setBounds(id, bounds)
    })
    // Bridge: main-window pushes editor / workspace events through the runtime
    // so every subscribed extension receives them. Phase 2 will wire these
    // events into the main process directly; Phase 1 piggybacks on the
    // renderer because that is where CodeMirror state lives.
    ipcMain.handle('canvExtDev:fireEvent', async (_e, type, payload) => {
      if (!extensionRuntime || typeof type !== 'string') return
      extensionRuntime.dispatchEvent(type, payload)
    })
  }

  // --- Production canvExtensions handlers ---

  ipcMain.handle('canvExtensions:listInstalled', async () => {
    const workspaceRegistry = getWorkspaceRegistry()
    if (!workspaceRegistry) return []
    return workspaceRegistry.listEntries()
  })

  ipcMain.handle('canvExtensions:getFileHandlerDefaults', async () => {
    const WORKSPACE = getWorkspace()
    if (!WORKSPACE || WORKSPACE.kind !== 'local') return {}
    return readFileHandlerDefaults(WORKSPACE.root)
  })

  ipcMain.handle('canvExtensions:setFileHandlerDefault', async (_e, ext, extensionId) => {
    const WORKSPACE = getWorkspace()
    if (!WORKSPACE || WORKSPACE.kind !== 'local') return { ok: false }
    writeFileHandlerDefault(WORKSPACE.root, ext, extensionId)
    const mainWindow = getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('canvExtensions:registryChanged')
    return { ok: true }
  })

  ipcMain.handle('canvExtensions:readAllContributions', async () => {
    const WORKSPACE = getWorkspace()
    const workspaceRegistry = getWorkspaceRegistry()
    if (!workspaceRegistry || !WORKSPACE || WORKSPACE.kind !== 'local') return EMPTY_CONTRIBS
    const wsTrust = trustStore.stateFor(WORKSPACE.root)
    if (wsTrust !== 'trusted') return EMPTY_CONTRIBS
    const dir = path.join(WORKSPACE.root, '.canv', 'extensions')
    const all = buildAllContributions(dir, workspaceRegistry.listEntries())
    // Overlay live status-bar overrides.
    const statusBarItems = all.statusBarItems.map((item) => {
      const o = statusBarOverrides.get(`${item.extensionId}:${item.id}`)
      return o ? { ...item, ...(o.text != null ? { text: o.text } : {}), ...(o.icon != null ? { icon: o.icon } : {}), ...(o.tooltip != null ? { tooltip: o.tooltip } : {}) } : item
    })
    return { ...all, statusBarItems }
  })

  ipcMain.handle('canvExtensions:previewInstall', async (_e, sourcePath) => {
    if (typeof sourcePath !== 'string' || !sourcePath) return { ok: false, errors: ['invalid source path'] }
    const stat = await fsp.stat(sourcePath).catch(() => null)
    if (!stat) return { ok: false, errors: [`source not found: ${sourcePath}`] }
    let folder = sourcePath
    let tempUnpack = null
    if (stat.isFile()) {
      if (!sourcePath.endsWith('.canvext')) {
        return { ok: false, errors: ['source file must be a .canvext zip'] }
      }
      tempUnpack = await fsp.mkdtemp(path.join(os.tmpdir(), 'canvext-preview-'))
      try {
        unpackCanvext(sourcePath, tempUnpack)
      } catch (e) {
        await fsp.rm(tempUnpack, { recursive: true, force: true })
        return { ok: false, errors: [`canvext unpack failed: ${e.message}`] }
      }
      folder = tempUnpack
    } else if (!stat.isDirectory()) {
      return { ok: false, errors: ['source must be a folder or .canvext file'] }
    }
    try {
      let raw
      try { raw = JSON.parse(await fsp.readFile(path.join(folder, 'manifest.json'), 'utf-8')) }
      catch (e) { return { ok: false, errors: [`manifest read/parse failed: ${e.message}`] } }
      const v = validateManifest(raw)
      if (!v.ok) return { ok: false, errors: v.errors }
      return {
        ok: true,
        manifest: {
          id: v.manifest.id,
          name: v.manifest.name,
          version: v.manifest.version,
          description: v.manifest.description,
          author: v.manifest.author,
          capabilities: v.manifest.capabilities,
          network: v.manifest.network ?? [],
          executables: v.manifest.executables ?? [],
          writePaths: v.manifest.writePaths ?? [],
          settings: v.manifest.settings ?? [],
          contributions: v.manifest.contributions,
        },
      }
    } finally {
      if (tempUnpack) await fsp.rm(tempUnpack, { recursive: true, force: true })
    }
  })

  ipcMain.handle('canvExtensions:install', async (_e, sourcePath) => {
    const WORKSPACE = getWorkspace()
    const workspaceRegistry = getWorkspaceRegistry()
    if (!workspaceRegistry) throw new Error('no workspace open')
    if (!WORKSPACE || WORKSPACE.kind !== 'local') throw new Error('extensions require local workspace')
    if (typeof sourcePath !== 'string' || !sourcePath) {
      return { ok: false, errors: ['invalid source path'] }
    }

    let folder = sourcePath
    let tempUnpack = null
    const srcStat = await fsp.stat(sourcePath).catch(() => null)
    if (!srcStat) return { ok: false, errors: [`source not found: ${sourcePath}`] }
    if (srcStat.isFile()) {
      if (!sourcePath.endsWith('.canvext')) {
        return { ok: false, errors: ['source file must be a .canvext zip'] }
      }
      tempUnpack = await fsp.mkdtemp(path.join(os.tmpdir(), 'canvext-'))
      try {
        unpackCanvext(sourcePath, tempUnpack)
      } catch (e) {
        await fsp.rm(tempUnpack, { recursive: true, force: true })
        return { ok: false, errors: [`canvext unpack failed: ${e.message}`] }
      }
      folder = tempUnpack
    } else if (!srcStat.isDirectory()) {
      return { ok: false, errors: ['source must be a folder or .canvext file'] }
    }

    try {
      const srcManifestPath = path.join(folder, 'manifest.json')
      let raw
      try { raw = JSON.parse(await fsp.readFile(srcManifestPath, 'utf-8')) }
      catch (e) { return { ok: false, errors: [`manifest read/parse failed: ${e.message}`] } }
      const v = validateManifest(raw)
      if (!v.ok) return { ok: false, errors: v.errors }
      const id = v.manifest.id
      const targetDir = path.join(WORKSPACE.root, '.canv', 'extensions', id)
      await copyExtensionTree(folder, targetDir)
      const hash = await hashExtensionDir(targetDir)
      workspaceRegistry.install(v.manifest, hash)
      onRegistryChanged()
      return { ok: true, id }
    } finally {
      if (tempUnpack) await fsp.rm(tempUnpack, { recursive: true, force: true })
    }
  })

  ipcMain.handle('canvExtensions:uninstall', async (_e, id) => {
    const WORKSPACE = getWorkspace()
    const workspaceRegistry = getWorkspaceRegistry()
    if (!workspaceRegistry) throw new Error('no workspace open')
    if (extensionRuntime?.manifestFor(id)) await extensionRuntime.destroy(id)
    workspaceRegistry.uninstall(id)
    const dir = path.join(WORKSPACE.root, '.canv', 'extensions', id)
    await fsp.rm(dir, { recursive: true, force: true })
    onRegistryChanged()
  })

  ipcMain.handle('canvExtensions:setEnabled', async (_e, id, enabled) => {
    const WORKSPACE = getWorkspace()
    const workspaceRegistry = getWorkspaceRegistry()
    if (!workspaceRegistry) throw new Error('no workspace open')
    workspaceRegistry.setEnabled(id, Boolean(enabled))
    if (!enabled && extensionRuntime?.manifestFor(id)) {
      await extensionRuntime.destroy(id)
    } else if (enabled) {
      // Toggling on doesn't unconditionally spawn anymore. If the manifest
      // declares ONLY lazy-load activation events (workspaceContains:, onUri:,
      // onCommand:), respect them and wait for the trigger to fire. Otherwise
      // (onStartup, inferred panel/statusBar events, or no declared events at
      // all) spawn immediately so the user sees their newly-enabled extension.
      const entry = workspaceRegistry.get(id)
      const wsTrust = trustStore.stateFor(WORKSPACE?.root || '')
      if (entry && entry.trustedAt != null && wsTrust === 'trusted' && !extensionRuntime.manifestFor(id)) {
        const manifest = readInstalledManifestSync(id)
        const events = manifest ? activationEventsLib.effectiveActivationEvents(manifest) : []
        const isLazyOnly = events.length > 0 && events.every((e) =>
          e.startsWith('workspaceContains:') ||
          e.startsWith('onUri:') ||
          e.startsWith('onCommand:'),
        )
        if (!isLazyOnly) {
          try {
            const r = await spawnInstalled(id)
            if (r && !r.ok) console.warn('spawn refused on enable:', r.reason)
          } catch (e) { console.error('spawn on enable failed:', e) }
        } else {
          // Rebuild the workspaceContains evaluator's matchers + re-walk the
          // vault so any already-present matching file fires activation now.
          try { setupWorkspaceContains() } catch (e) { console.error('[workspaceContains] re-eval on enable failed', e) }
        }
      }
    }
    onRegistryChanged()
  })

  ipcMain.handle('canvExtensions:setTrustedAt', async (_e, id, isoOrNull) => {
    const workspaceRegistry = getWorkspaceRegistry()
    if (!workspaceRegistry) throw new Error('no workspace open')
    workspaceRegistry.setTrustedAt(id, isoOrNull)
    onRegistryChanged()
  })

  ipcMain.handle('canvExtensions:getWorkspaceTrust', async () => {
    const WORKSPACE = getWorkspace()
    if (!WORKSPACE || WORKSPACE.kind !== 'local') return 'untrusted'
    return trustStore.stateFor(WORKSPACE.root)
  })

  ipcMain.handle('canvExtensions:setWorkspaceTrust', async (_e, state) => {
    const WORKSPACE = getWorkspace()
    if (!WORKSPACE || WORKSPACE.kind !== 'local') throw new Error('no local workspace')
    trustStore.set(WORKSPACE.root, state)
    if (state !== 'trusted') {
      for (const e of extensionRuntime.list()) await extensionRuntime.destroy(e.id)
    }
    onRegistryChanged()
  })

  ipcMain.handle('canvExtensions:readSettings', async (_e, id) => {
    const WORKSPACE = getWorkspace()
    if (!WORKSPACE || WORKSPACE.kind !== 'local') return {}
    const file = path.join(WORKSPACE.root, '.canv', 'extensions', id, 'settings.json')
    try { return JSON.parse(await fsp.readFile(file, 'utf-8')) }
    catch { return {} }
  })

  ipcMain.handle('canvExtensions:writeSetting', async (_e, id, key, value) => {
    const WORKSPACE = getWorkspace()
    if (!WORKSPACE || WORKSPACE.kind !== 'local') throw new Error('no local workspace')
    if (typeof key !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) throw new Error('invalid key')
    const dir = path.join(WORKSPACE.root, '.canv', 'extensions', id)
    const file = path.join(dir, 'settings.json')
    let current = {}
    try { current = JSON.parse(await fsp.readFile(file, 'utf-8')) } catch { /* default */ }
    current[key] = value
    await fsp.mkdir(dir, { recursive: true })
    const tmp = file + '.tmp'
    await fsp.writeFile(tmp, JSON.stringify(current, null, 2), 'utf-8')
    await fsp.rename(tmp, file)
    // Notify the running extension renderer (if any) about the change.
    const wcId = Array.from(extensionRuntime._wcIdToId.entries()).find(([, eid]) => eid === id)?.[0]
    if (wcId) {
      const wc = electron.webContents.fromId(wcId)
      if (wc && !wc.isDestroyed()) wc.send('canvExt:settings.changed', { key, value })
    }
  })

  ipcMain.handle('canvExtensions:readManifest', async (_e, id) => {
    const WORKSPACE = getWorkspace()
    if (!WORKSPACE || WORKSPACE.kind !== 'local') throw new Error('no workspace')
    const file = path.join(WORKSPACE.root, '.canv', 'extensions', id, 'manifest.json')
    return JSON.parse(await fsp.readFile(file, 'utf-8'))
  })

  ipcMain.handle('canvExtensions:listFiles', async (_e, id) => {
    const WORKSPACE = getWorkspace()
    if (!WORKSPACE || WORKSPACE.kind !== 'local') return []
    const root = path.join(WORKSPACE.root, '.canv', 'extensions', id)
    const out = []
    async function walk(dir, prefix) {
      const entries = await fsp.readdir(dir, { withFileTypes: true })
      for (const e of entries) {
        const rel = prefix ? `${prefix}/${e.name}` : e.name
        if (e.isDirectory()) await walk(path.join(dir, e.name), rel)
        else out.push(rel)
      }
    }
    try { await walk(root, '') } catch { /* return [] */ }
    return out.sort()
  })

  ipcMain.handle('canvExtensions:readFile', async (_e, id, rel) => {
    const WORKSPACE = getWorkspace()
    if (!WORKSPACE || WORKSPACE.kind !== 'local') throw new Error('no workspace')
    if (typeof rel !== 'string' || /\.\./.test(rel)) throw new Error('invalid path')
    const file = path.join(WORKSPACE.root, '.canv', 'extensions', id, rel)
    const stat = await fsp.stat(file)
    if (!stat.isFile()) throw new Error('not a file')
    if (stat.size > 1024 * 1024) throw new Error('file too large')
    return fsp.readFile(file, 'utf-8')
  })

  ipcMain.handle('canvExtensions:reload', async (_e, id) => {
    const workspaceRegistry = getWorkspaceRegistry()
    if (!extensionRuntime || !workspaceRegistry) return
    const wasRunning = !!extensionRuntime.manifestFor(id)
    if (wasRunning) await extensionRuntime.destroy(id)
    if (wasRunning) await spawnInstalled(id)
  })

  // Dev-only: forcefully crash a running extension's renderer process so the
  // crash-detection wiring (render-process-gone → canvExtensions:crashed) can
  // be smoke-tested without trying to OOM V8 from inside the sandbox.
  if (!app.isPackaged) {
    ipcMain.handle('canvExtensions:devCrash', async (_e, id) => {
      const wcId = Array.from(extensionRuntime._wcIdToId.entries()).find(([, eid]) => eid === id)?.[0]
      if (!wcId) return { ok: false, error: 'extension not running' }
      const wc = electron.webContents.fromId(wcId)
      if (!wc || wc.isDestroyed()) return { ok: false, error: 'webContents gone' }
      // SIGKILL the renderer's OS process directly. This bypasses V8 (which
      // catches ArrayBuffer-overflow as RangeError instead of crashing) and
      // forcefullyCrashRenderer (which trips Chromium's hung-process detector
      // on some Linux/MESA setups). Fires render-process-gone with reason=killed.
      const pid = wc.getOSProcessId()
      if (pid > 0) {
        try { process.kill(pid, 'SIGKILL') } catch { /* renderer already gone */ }
      }
      return { ok: true, pid }
    })
  }

  ipcMain.handle('canvExtensions:pickInstallFolder', async () => {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose an extension folder to install',
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('canvExtensions:pickInstallFile', async () => {
    const mainWindow = getMainWindow()
    if (!mainWindow || mainWindow.isDestroyed()) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a .canvext file to install',
      properties: ['openFile'],
      filters: [{ name: 'Canv Extension', extensions: ['canvext'] }],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('canvExtensions:readActivity', async (_e, id) => {
    return activity.get(id)
  })

  ipcMain.handle('canvExtensions:requestActivation', async (_e, trigger) => {
    const WORKSPACE = getWorkspace()
    const workspaceRegistry = getWorkspaceRegistry()
    if (!extensionRuntime || !workspaceRegistry) return
    const wsTrust = trustStore.stateFor(WORKSPACE?.root || '')
    if (wsTrust !== 'trusted') return
    for (const entry of workspaceRegistry.listEntries()) {
      if (!entry.enabled || entry.trustedAt == null) continue
      if (extensionRuntime.manifestFor(entry.id)) continue
      // Hash check happens inside spawnInstalled; we just read the manifest
      // here to decide whether the trigger matches the extension's
      // activationEvents.
      const dir = path.join(WORKSPACE.root, '.canv', 'extensions', entry.id)
      let manifest
      try { manifest = JSON.parse(await fsp.readFile(path.join(dir, 'manifest.json'), 'utf-8')) }
      catch { continue }
      if (shouldActivateFor(manifest, trigger)) await spawnInstalled(entry.id)
    }
  })

  ipcMain.handle('canvExtensions:showPanelInSlot', async (e, slotId, bounds) => {
    const workspaceRegistry = getWorkspaceRegistry()
    if (!extensionRuntime || !workspaceRegistry) return { ok: false, error: 'no runtime' }
    const m = /^ext:([^:]+):([^:]+)$/.exec(slotId)
    if (!m) return { ok: false, error: 'malformed slotId' }
    const [, extensionId] = m
    // The slot lives in whichever BrowserWindow's renderer invoked us — main
    // for an in-window dock, popout for a popped-out dock. Bounds are in that
    // window's coordinate space, so the WebContentsView must be attached
    // there.
    const mainWindow = getMainWindow()
    const hostWindow = BrowserWindow.fromWebContents(e.sender) || mainWindow
    if (extensionRuntime.manifestFor(extensionId)) {
      extensionRuntime.reparent(extensionId, hostWindow)
      extensionRuntime.setBounds(extensionId, bounds)
      return { ok: true }
    }
    return await spawnInstalled(extensionId, { bounds, hostWindow })
  })

  ipcMain.handle('canvExtensions:hidePanelInSlot', async (_e, slotId) => {
    const m = /^ext:([^:]+):([^:]+)$/.exec(slotId)
    if (!m) return
    const [, extensionId] = m
    if (extensionRuntime?.manifestFor(extensionId)) {
      extensionRuntime.setBounds(extensionId, { x: 0, y: 0, width: 0, height: 0 })
    }
  })

  ipcMain.handle('canvExtensions:showFileInExtension', async (_e, extensionId, relPath, mode, bounds) => {
    const WORKSPACE = getWorkspace()
    const workspaceRegistry = getWorkspaceRegistry()
    if (!extensionRuntime || !workspaceRegistry || !WORKSPACE || WORKSPACE.kind !== 'local') return { ok: false, error: 'no workspace' }
    const wsTrust = trustStore.stateFor(WORKSPACE.root)
    if (wsTrust !== 'trusted') return { ok: false, error: 'workspace not trusted' }
    let absPath
    try { absPath = safeResolve(WORKSPACE.root, relPath) }
    catch (e) { return { ok: false, error: (e && e.message) || 'path escape' } }
    extensionActiveFile.set(extensionId, { relPath, absPath, mode })
    if (extensionRuntime.manifestFor(extensionId)) {
      extensionRuntime.setBounds(extensionId, bounds)
      extensionRuntime.dispatchEvent('canvExt:activeFile.changed', { extensionId, relPath, mode })
      return { ok: true }
    }
    // First spawn for this fileHandler — load its declared entry, not the
    // default index.html (which doesn't exist on fileHandler-only extensions).
    const ext = (relPath.match(/\.[^./\\]+$/) || [''])[0].toLowerCase()
    const dir = path.join(WORKSPACE.root, '.canv', 'extensions', extensionId)
    let entryRel = null
    try {
      const manifest = JSON.parse(await fsp.readFile(path.join(dir, 'manifest.json'), 'utf-8'))
      const handler = (manifest.contributions || []).find((c) => c && c.type === 'fileHandler' && Array.isArray(c.extensions) && c.extensions.includes(ext))
      if (handler && typeof handler.entry === 'string') entryRel = handler.entry
    } catch { /* fall through; spawnInstalled will use default */ }
    return await spawnInstalled(extensionId, { bounds, entryRel })
  })

  ipcMain.handle('canvExtensions:hideFileInExtension', async (_e, extensionId /*, _relPath */) => {
    // Do NOT clear extensionActiveFile here. React strict-mode mounts the
    // slot twice (mount → cleanup → remount), which would otherwise race
    // against the renderer's first getBytes call and produce "no active
    // file for this extension". The next showFileInExtension overwrites the
    // entry; closing the tab just hides the view via zero bounds.
    if (extensionRuntime?.manifestFor(extensionId)) {
      extensionRuntime.setBounds(extensionId, { x: 0, y: 0, width: 0, height: 0 })
    }
  })

  ipcMain.handle('canvExtensions:invokeCommand', async (_e, commandId, args) => {
    const WORKSPACE = getWorkspace()
    const workspaceRegistry = getWorkspaceRegistry()
    if (!extensionRuntime || !workspaceRegistry || !WORKSPACE || WORKSPACE.kind !== 'local') return { ok: false, error: 'no workspace' }
    const wsTrust = trustStore.stateFor(WORKSPACE.root)
    if (wsTrust !== 'trusted') return { ok: false, error: 'workspace not trusted' }
    const dir = path.join(WORKSPACE.root, '.canv', 'extensions')
    for (const entry of workspaceRegistry.listEntries()) {
      if (!entry.enabled || entry.trustedAt == null) continue
      let manifest
      try { manifest = JSON.parse(await fsp.readFile(path.join(dir, entry.id, 'manifest.json'), 'utf-8')) }
      catch { continue }
      const cmd = (manifest.contributions || []).find((c) => c && c.type === 'command' && c.id === commandId)
      if (cmd) {
        if (!extensionRuntime.manifestFor(entry.id)) {
          await spawnInstalled(entry.id)
        }
        const wcId = Array.from(extensionRuntime._wcIdToId.entries()).find(([, eid]) => eid === entry.id)?.[0]
        if (wcId) {
          const wc = electron.webContents.fromId(wcId)
          if (wc && !wc.isDestroyed()) wc.send('canvExt:commands.invoke', { commandId, args })
        }
        return { ok: true }
      }
    }
    return { ok: false, error: 'command not found' }
  })
}

module.exports = { registerIpcHandlers, __test__: { unpackCanvext, MAX_CANVEXT_BYTES } }
