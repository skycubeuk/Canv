const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const { RecentRemotes } = require('./recent-remotes.cjs')
const serve = require('./serve-folder.cjs')
const { createHistoryService } = require('./history-service.cjs')
const electron = require('electron')
const { ExtensionRuntime } = require('./extensions/runtime.cjs')
const { registerProtocol } = require('./extensions/protocol.cjs')
const { createActiveDocHandlers } = require('./extensions/handlers/active-doc.cjs')
const { createWorkspaceHandlers } = require('./extensions/handlers/workspace.cjs')
const { createEventsHandlers } = require('./extensions/handlers/events.cjs')
const { createStorageHandlers } = require('./extensions/handlers/storage.cjs')
const { createUiHandlers } = require('./extensions/handlers/ui.cjs')
const { validateManifest } = require('./extensions/manifest-schema.cjs')
const { Registry } = require('./extensions/registry.cjs')
const { WorkspaceTrustStore } = require('./extensions/workspace-trust.cjs')
const { MAX_OPEN_BYTES } = require('./services/fs-limits.cjs')
const fsService       = require('./services/fs')
const serveService    = require('./services/serve')
const historyService  = require('./services/history')
const sitesService    = require('./services/sites')
const dockService     = require('./services/dock')
const extService      = require('./services/extensions')
const wsService       = require('./services/workspace')
const { hashExtensionDir } = require('./extensions/manifest-hash.cjs')
const { shouldActivateFor } = require('./extensions/activation-events.cjs')
const { createSettingsHandlers } = require('./extensions/handlers/settings.cjs')
const { createAiHandlers } = require('./extensions/handlers/ai.cjs')
const { createNetHandlers } = require('./extensions/handlers/net.cjs')
const { createUiPromptHandlers } = require('./extensions/handlers/ui-prompt.cjs')
const { createStatusBarHandlers } = require('./extensions/handlers/statusBar.cjs')
const activity = require('./extensions/activity.cjs')
const { buildAllContributions, EMPTY: EMPTY_CONTRIBS } = require('./extensions/contributions.cjs')
const { readDefaults: readFileHandlerDefaults, writeDefault: writeFileHandlerDefault } = require('./extensions/file-handler-defaults.cjs')

let extensionRuntime = null
let trustStore = null
let workspaceRegistry = null
const pendingPrompts = new Map()    // reqId → { resolve, reject }
const statusBarOverrides = new Map() // key: '<extensionId>:<itemId>' → { text?, icon?, tooltip? }
// Phase 5b: tracks the file each fileHandler-spawned extension is showing,
// so canv.activeDoc.getBytes/setBytes know which path to operate on.
const extensionActiveFile = new Map() // extensionId → { relPath, absPath, mode }
let nextPromptId = 1

function onWorkspaceChangedGlobal() {
  workspaceRegistry = (WORKSPACE && WORKSPACE.kind === 'local')
    ? new Registry(WORKSPACE.root)
    : null
  invalidateExtensionClaimedExts()
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('canvExtensions:registryChanged')
  }
}

const APP_ICON = path.join(__dirname, '..', 'build', 'icon.png')

const EXTENSIONS_TEST_FIXTURES_DIR = path.join(__dirname, 'extensions', 'test-fixtures')
const EXTENSIONS_SHARED_DIR = path.join(__dirname, 'extensions', 'shared-assets')
const EXTENSION_PRELOAD_PATH = path.join(__dirname, 'extensions', 'extension-preload.cjs')

const DEV_URL = 'http://localhost:5173'

// ---------- Screenshot harness env overrides ----------
// When CANV_SCREENSHOT_WORKSPACE is set the app opens that folder directly,
// bypassing the OS folder picker. Safe in production: does nothing when the
// vars are absent. The values are forwarded to the renderer via
// additionalArguments so the sandboxed preload can seed localStorage before
// React runs.
const screenshotWs = process.env.CANV_SCREENSHOT_WORKSPACE || ''
const screenshotTheme = process.env.CANV_SCREENSHOT_THEME || ''
const screenshotProfile = process.env.CANV_SCREENSHOT_PROFILE || ''
// CANV_SCREENSHOT_SEED_RUNS: JSON blob (array of RunRecord) to pre-seed
// canv:runs in localStorage so screenshot captures can show run history without
// a live API call. Passed as a base64-encoded string via additionalArguments.
const screenshotSeedRuns = (() => {
  const raw = process.env.CANV_SCREENSHOT_SEED_RUNS || ''
  if (!raw) return ''
  try {
    // Validate it's parseable JSON before encoding.
    JSON.parse(raw)
    return Buffer.from(raw).toString('base64')
  } catch {
    return ''
  }
})()

// CANV_SCREENSHOT_SEED_LEGACY: when '1', tells the preload to write the v1
// legacy localStorage keys (canv:document, canv:title, canv:contextFiles) so
// the MigrationModal appears on first load. Used only for screenshot capture.
const screenshotSeedLegacy = process.env.CANV_SCREENSHOT_SEED_LEGACY === '1' ? '1' : ''

// ---------- FS bridge ----------

const PUBLIC_EXTS = new Set(['.md', '.markdown'])
const INTERNAL_EXTS = new Set(['.json'])
const SITE_EXTS = new Set([
  '.html', '.htm', '.css', '.js', '.mjs', '.json', '.svg', '.txt',
  '.md', '.csv', '.tsv', '.yaml', '.yml',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico',
])
const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', '.DS_Store'])
const MAX_LIST_ENTRIES = 5000
const MAX_DEPTH = 8

// Active workspace state. null when no workspace is open.
// Local: { kind: 'local', root }
// Remote: { kind: 'remote', target, raw, pool, backend, unsub }
let WORKSPACE = null
let HISTORY = null
let recentRemotes = null
let mainWindow = null

function getHistoryService() {
  if (WORKSPACE?.kind !== 'local' || !WORKSPACE.root) {
    throw new Error('History is not available (no local workspace open)')
  }
  if (!HISTORY || HISTORY.__root !== WORKSPACE.root) {
    HISTORY = createHistoryService({ root: WORKSPACE.root })
    HISTORY.__root = WORKSPACE.root
  }
  return HISTORY
}

function isInternal(rel) {
  return rel === '.canv' || rel.startsWith('.canv/')
}

function isSitePath(rel) {
  if (!rel.startsWith('.canv/sites/')) return false
  const parts = rel.split('/')
  return parts.length >= 4 && parts[2].length > 0
}

// Set of file extensions claimed by enabled+trusted extensions' language or
// fileHandler contributions in the current workspace. Lazily rebuilt — kept
// in sync via invalidateExtensionClaimedExts() on registry changes.
let extensionClaimedExts = null

function getExtensionClaimedExts() {
  if (extensionClaimedExts) return extensionClaimedExts
  const out = new Set()
  try {
    if (workspaceRegistry && WORKSPACE && WORKSPACE.kind === 'local') {
      const dir = path.join(WORKSPACE.root, '.canv', 'extensions')
      for (const entry of workspaceRegistry.listEntries()) {
        if (!entry.enabled || entry.trustedAt == null) continue
        let manifest
        try { manifest = JSON.parse(fs.readFileSync(path.join(dir, entry.id, 'manifest.json'), 'utf-8')) }
        catch { continue }
        for (const c of (manifest.contributions || [])) {
          if (!c || (c.type !== 'language' && c.type !== 'fileHandler')) continue
          if (!Array.isArray(c.extensions)) continue
          for (const e of c.extensions) {
            if (typeof e === 'string') out.add(e.toLowerCase())
          }
        }
      }
    }
  } catch { /* fall through with whatever we have */ }
  extensionClaimedExts = out
  return out
}

function invalidateExtensionClaimedExts() {
  extensionClaimedExts = null
}

function isAllowedExt(rel, abs) {
  const ext = path.extname(abs).toLowerCase()
  if (rel === '.canv/site_index.yaml') return ext === '.yaml'
  if (isSitePath(rel)) return SITE_EXTS.has(ext)
  if (isInternal(rel)) return INTERNAL_EXTS.has(ext)
  if (PUBLIC_EXTS.has(ext)) return true
  // Extensions that contribute a language or fileHandler for this extension
  // unlock the file for reading. Without this, .tex/.bib/etc would be
  // rejected by the FS bridge before a language contribution could syntax-
  // highlight them.
  return getExtensionClaimedExts().has(ext)
}

function isAllowedDirEntry(name) {
  if (SKIP_DIRS.has(name)) return false
  if (name.startsWith('.')) return false
  return true
}

function safeResolve(root, rel) {
  if (typeof rel !== 'string') throw new Error('invalid path')
  if (rel.includes('\0')) throw new Error('invalid path')
  // Reject absolute paths and Windows drive letters
  if (rel.startsWith('/') || rel.startsWith('\\') || /^[a-zA-Z]:/.test(rel)) {
    throw new Error('absolute paths not allowed')
  }
  const normalized = rel.replace(/\\/g, '/').replace(/^\.\/+/, '')
  if (normalized.split('/').some((seg) => seg === '..')) {
    throw new Error('parent traversal not allowed')
  }
  const abs = path.resolve(root, normalized)
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error('path escape')
  }
  return abs
}

function requireWorkspace() {
  if (!WORKSPACE) throw new Error('no workspace selected')
  if (WORKSPACE.kind !== 'local') throw new Error('local-only operation on remote workspace')
  return WORKSPACE.root
}

function isRemote() { return WORKSPACE?.kind === 'remote' }

function toRel(root, abs) {
  const rel = path.relative(root, abs)
  return rel.split(path.sep).join('/')
}

async function buildTree(root, relDir, depth) {
  const abs = relDir ? safeResolve(root, relDir) : root
  let entries
  try {
    entries = await fsp.readdir(abs, { withFileTypes: true })
  } catch {
    return { name: path.basename(abs), relPath: relDir, kind: 'dir', children: [], truncated: false }
  }
  entries.sort((a, b) => {
    const da = a.isDirectory() ? 0 : 1
    const db = b.isDirectory() ? 0 : 1
    if (da !== db) return da - db
    return a.name.localeCompare(b.name)
  })
  const children = []
  let count = 0
  let truncated = false
  for (const ent of entries) {
    if (count >= MAX_LIST_ENTRIES) { truncated = true; break }
    if (!isAllowedDirEntry(ent.name)) continue
    const childRel = relDir ? `${relDir}/${ent.name}` : ent.name
    const childAbs = path.join(abs, ent.name)
    if (ent.isDirectory()) {
      if (depth >= MAX_DEPTH) {
        children.push({ name: ent.name, relPath: childRel, kind: 'dir', children: [], truncated: true })
      } else {
        children.push(await buildTree(root, childRel, depth + 1))
      }
      count++
    } else if (ent.isFile()) {
      let stat
      try { stat = await fsp.stat(childAbs) } catch { continue }
      const allowed = isAllowedExt(childRel, childAbs)
      children.push({
        name: ent.name,
        relPath: childRel,
        kind: 'file',
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        binary: !allowed,
      })
      count++
    }
  }
  return {
    name: relDir ? path.basename(abs) : path.basename(root),
    relPath: relDir,
    kind: 'dir',
    children,
    truncated,
  }
}

async function closeWorkspace() {
  await serve.stop()
  if (!WORKSPACE) return
  if (WORKSPACE.kind === 'local') {
    fsService.stopWatcher()
  } else if (WORKSPACE.kind === 'remote') {
    if (WORKSPACE.unsub) { try { WORKSPACE.unsub() } catch { /* ignore */ } }
    try { await WORKSPACE.pool.close() } catch { /* ignore */ }
  }
  WORKSPACE = null
  HISTORY = null
}

function registerLegacyServeBroadcast() {
  // serve broadcasts: wire once at app startup. Remains in main.cjs until
  // the serve domain takes ownership of its broadcast lifecycle.
  serve.onStatusChange((s) => {
    let payload = s
    if (s.running && WORKSPACE && WORKSPACE.kind === 'local') {
      const resolvedWs = path.resolve(WORKSPACE.root)
      const rel = path.relative(resolvedWs, s.root).split(path.sep).join('/')
      payload = { ...s, relPath: rel }
    }
    for (const w of BrowserWindow.getAllWindows()) {
      try { w.webContents.send('canvServe:statusChanged', payload) } catch { /* ignore */ }
    }
  })
}


let popoutWindow = null

function buildExtensionHost() {
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
    if (!WORKSPACE || WORKSPACE.kind !== 'local') throw new Error('no local workspace open')
    return WORKSPACE.root
  }

  return {
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
      const tree = await buildTree(root, globOrDir || '', 0)
      return tree
    },
    readWorkspaceText: async (rel) => {
      const root = workspaceRootOrLocalThrow()
      const abs = safeResolve(root, rel)
      const stat = await fsp.stat(abs)
      if (!stat.isFile()) throw new Error('not a file')
      if (stat.size > MAX_OPEN_BYTES) throw new Error('file too large')
      return fsp.readFile(abs, 'utf-8')
    },

    // ui
    notifyToMainWindow: (msg, kind, extensionId) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('canvExt:notification', { message: msg, kind, extensionId })
      }
    },
    showConfirmDialog: async (msg) => {
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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('canvExtensions:statusBarChanged', { extensionId: payload.extensionId, itemId, ...next })
      }
    },
  }
}

function registerExtensionHandlers() {
  const host = buildExtensionHost()
  extensionRuntime = new ExtensionRuntime({
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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('canvExtensions:crashed', { id, reason: details?.reason ?? 'unknown' })
      }
    },
  })

  const TRUST_FILE = path.join(app.getPath('userData'), 'Canv', 'trusted-workspaces.json')
  trustStore = new WorkspaceTrustStore(TRUST_FILE)

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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('canvExtensions:registryChanged')
    }
  }

  // Per-extension in-flight spawn locks. React strict-mode and fast tab
  // switches can fire showFileInExtension twice before the first spawn
  // completes; without the lock the second call sees manifestFor still false
  // and tries to spawn again, throwing "already spawned".
  const spawnLocks = new Map()

  async function spawnInstalled(id, opts = {}) {
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
    const hostWindow = opts.hostWindow && !opts.hostWindow.isDestroyed() ? opts.hostWindow : mainWindow
    await extensionRuntime.spawn({
      extensionDir: dir, manifest, hostWindow, bounds,
      entryRel: opts.entryRel,
    })
    return { ok: true }
    })()
    spawnLocks.set(id, promise)
    try { return await promise }
    finally { spawnLocks.delete(id) }
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
      settingsFileFor: (id) => path.join(WORKSPACE.root, '.canv', 'extensions', id, 'settings.json'),
    }),
    ...createAiHandlers({ runtime: extensionRuntime, host }),
    ...createNetHandlers({ runtime: extensionRuntime, onRequest: (id) => activity.recordNet(id) }),
    ...createUiPromptHandlers({ runtime: extensionRuntime, host }),
    ...createStatusBarHandlers({ runtime: extensionRuntime, host }),
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
    if (!workspaceRegistry) return []
    return workspaceRegistry.listEntries()
  })

  ipcMain.handle('canvExtensions:getFileHandlerDefaults', async () => {
    if (!WORKSPACE || WORKSPACE.kind !== 'local') return {}
    return readFileHandlerDefaults(WORKSPACE.root)
  })

  ipcMain.handle('canvExtensions:setFileHandlerDefault', async (_e, ext, extensionId) => {
    if (!WORKSPACE || WORKSPACE.kind !== 'local') return { ok: false }
    writeFileHandlerDefault(WORKSPACE.root, ext, extensionId)
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('canvExtensions:registryChanged')
    return { ok: true }
  })

  ipcMain.handle('canvExtensions:readAllContributions', async () => {
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

  ipcMain.handle('canvExtensions:previewInstall', async (_e, folder) => {
    if (typeof folder !== 'string' || !folder) return { ok: false, errors: ['invalid folder'] }
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
        settings: v.manifest.settings ?? [],
        contributions: v.manifest.contributions,
      },
    }
  })

  ipcMain.handle('canvExtensions:install', async (_e, sourceFolderAbsPath) => {
    if (!workspaceRegistry) throw new Error('no workspace open')
    if (!WORKSPACE || WORKSPACE.kind !== 'local') throw new Error('extensions require local workspace')
    if (typeof sourceFolderAbsPath !== 'string' || !sourceFolderAbsPath) {
      return { ok: false, errors: ['invalid source folder'] }
    }
    const srcManifestPath = path.join(sourceFolderAbsPath, 'manifest.json')
    let raw
    try { raw = JSON.parse(await fsp.readFile(srcManifestPath, 'utf-8')) }
    catch (e) { return { ok: false, errors: [`manifest read/parse failed: ${e.message}`] } }
    const v = validateManifest(raw)
    if (!v.ok) return { ok: false, errors: v.errors }
    const id = v.manifest.id
    const targetDir = path.join(WORKSPACE.root, '.canv', 'extensions', id)
    await copyExtensionTree(sourceFolderAbsPath, targetDir)
    const hash = await hashExtensionDir(targetDir)
    workspaceRegistry.install(v.manifest, hash)
    onRegistryChanged()
    return { ok: true, id }
  })

  ipcMain.handle('canvExtensions:uninstall', async (_e, id) => {
    if (!workspaceRegistry) throw new Error('no workspace open')
    if (extensionRuntime?.manifestFor(id)) await extensionRuntime.destroy(id)
    workspaceRegistry.uninstall(id)
    const dir = path.join(WORKSPACE.root, '.canv', 'extensions', id)
    await fsp.rm(dir, { recursive: true, force: true })
    onRegistryChanged()
  })

  ipcMain.handle('canvExtensions:setEnabled', async (_e, id, enabled) => {
    if (!workspaceRegistry) throw new Error('no workspace open')
    workspaceRegistry.setEnabled(id, Boolean(enabled))
    if (!enabled && extensionRuntime?.manifestFor(id)) {
      await extensionRuntime.destroy(id)
    } else if (enabled) {
      // Toggling on is an explicit "I want this running" signal — spawn now,
      // bypassing the activation-event lazy-load (which is for installed-but-
      // unused extensions and waits for real triggers; Phase 5 wires those).
      // spawnInstalled re-hashes and revokes trust + flips enabled=false if
      // the on-disk files have drifted since install (tamper detection).
      const entry = workspaceRegistry.get(id)
      const wsTrust = trustStore.stateFor(WORKSPACE?.root || '')
      if (entry && entry.trustedAt != null && wsTrust === 'trusted' && !extensionRuntime.manifestFor(id)) {
        try {
          const r = await spawnInstalled(id)
          if (r && !r.ok) console.warn('spawn refused on enable:', r.reason)
        } catch (e) { console.error('spawn on enable failed:', e) }
      }
    }
    onRegistryChanged()
  })

  ipcMain.handle('canvExtensions:setTrustedAt', async (_e, id, isoOrNull) => {
    if (!workspaceRegistry) throw new Error('no workspace open')
    workspaceRegistry.setTrustedAt(id, isoOrNull)
    onRegistryChanged()
  })

  ipcMain.handle('canvExtensions:getWorkspaceTrust', async () => {
    if (!WORKSPACE || WORKSPACE.kind !== 'local') return 'untrusted'
    return trustStore.stateFor(WORKSPACE.root)
  })

  ipcMain.handle('canvExtensions:setWorkspaceTrust', async (_e, state) => {
    if (!WORKSPACE || WORKSPACE.kind !== 'local') throw new Error('no local workspace')
    trustStore.set(WORKSPACE.root, state)
    if (state !== 'trusted') {
      for (const e of extensionRuntime.list()) await extensionRuntime.destroy(e.id)
    }
    onRegistryChanged()
  })

  ipcMain.handle('canvExtensions:readSettings', async (_e, id) => {
    if (!WORKSPACE || WORKSPACE.kind !== 'local') return {}
    const file = path.join(WORKSPACE.root, '.canv', 'extensions', id, 'settings.json')
    try { return JSON.parse(await fsp.readFile(file, 'utf-8')) }
    catch { return {} }
  })

  ipcMain.handle('canvExtensions:writeSetting', async (_e, id, key, value) => {
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
    if (!WORKSPACE || WORKSPACE.kind !== 'local') throw new Error('no workspace')
    const file = path.join(WORKSPACE.root, '.canv', 'extensions', id, 'manifest.json')
    return JSON.parse(await fsp.readFile(file, 'utf-8'))
  })

  ipcMain.handle('canvExtensions:listFiles', async (_e, id) => {
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
    if (!WORKSPACE || WORKSPACE.kind !== 'local') throw new Error('no workspace')
    if (typeof rel !== 'string' || /\.\./.test(rel)) throw new Error('invalid path')
    const file = path.join(WORKSPACE.root, '.canv', 'extensions', id, rel)
    const stat = await fsp.stat(file)
    if (!stat.isFile()) throw new Error('not a file')
    if (stat.size > 1024 * 1024) throw new Error('file too large')
    return fsp.readFile(file, 'utf-8')
  })

  ipcMain.handle('canvExtensions:reload', async (_e, id) => {
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
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Pick extension folder to install',
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  ipcMain.handle('canvExtensions:readActivity', async (_e, id) => {
    return activity.get(id)
  })

  ipcMain.handle('canvExtensions:requestActivation', async (_e, trigger) => {
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
    if (!extensionRuntime || !workspaceRegistry) return { ok: false, error: 'no runtime' }
    const m = /^ext:([^:]+):([^:]+)$/.exec(slotId)
    if (!m) return { ok: false, error: 'malformed slotId' }
    const [, extensionId] = m
    // The slot lives in whichever BrowserWindow's renderer invoked us — main
    // for an in-window dock, popout for a popped-out dock. Bounds are in that
    // window's coordinate space, so the WebContentsView must be attached
    // there.
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

function buildSearchPattern(q) {
  const flags = q.caseSensitive ? 'g' : 'gi'
  if (q.regex) return new RegExp(q.query, flags)
  // Literal substring — escape regex metacharacters.
  const escaped = q.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(escaped, flags)
}

function configureWindowOpenHandler(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url)
      if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') {
        shell.openExternal(url)
      }
    } catch {
      // malformed URL — drop silently
    }
    return { action: 'deny' }
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#171717' : '#fafaf9',
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Pass screenshot-harness values into the sandboxed preload via argv.
      // The preload reads these to seed localStorage before React runs.
      additionalArguments: [
        screenshotWs ? `--canv-screenshot-workspace=${screenshotWs}` : '',
        screenshotTheme ? `--canv-screenshot-theme=${screenshotTheme}` : '',
        screenshotProfile ? `--canv-screenshot-profile=${screenshotProfile}` : '',
        screenshotSeedRuns ? `--canv-screenshot-seed-runs=${screenshotSeedRuns}` : '',
        screenshotSeedLegacy ? `--canv-screenshot-seed-legacy=${screenshotSeedLegacy}` : '',
      ].filter(Boolean),
    },
  })
  mainWindow = win

  // In screenshot mode (or when packaged) load the built dist directly;
  // otherwise connect to the Vite dev server.
  const useDistFile = app.isPackaged || Boolean(screenshotWs)
  if (useDistFile) {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  } else {
    win.loadURL(DEV_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  }

  configureWindowOpenHandler(win)

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
    if (popoutWindow && !popoutWindow.isDestroyed()) {
      popoutWindow.destroy()
      popoutWindow = null
    }
    closeWorkspace()
  })
}

if (screenshotTheme === 'dark' || screenshotTheme === 'light') {
  // Drive nativeTheme so the BrowserWindow backgroundColor and OS chrome
  // match the requested theme from the very first paint.
  nativeTheme.themeSource = screenshotTheme
}

electron.protocol.registerSchemesAsPrivileged([
  {
    scheme: 'canv-extension',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false,
      allowServiceWorkers: false,
      corsEnabled: true,
    },
  },
])

function makeDeps() {
  return {
    // Mutable shared state — exposed as getters so handlers see live values.
    getWorkspace: () => WORKSPACE,
    setWorkspace: (w) => { WORKSPACE = w },
    getMainWindow: () => mainWindow,
    setMainWindow: (w) => { mainWindow = w },
    getPopoutWindow: () => popoutWindow,
    setPopoutWindow: (w) => { popoutWindow = w },
    getExtensionRuntime: () => extensionRuntime,
    setExtensionRuntime: (r) => { extensionRuntime = r },
    getHistory: () => HISTORY,
    setHistory: (h) => { HISTORY = h },
    getTrustStore: () => trustStore,
    setTrustStore: (s) => { trustStore = s },
    getWorkspaceRegistry: () => workspaceRegistry,
    setWorkspaceRegistry: (r) => { workspaceRegistry = r },
    getRecentRemotes: () => recentRemotes,
    setRecentRemotes: (r) => { recentRemotes = r },

    // Shared helpers — passed by reference.
    requireWorkspace, isRemote, safeResolve, isAllowedExt, isAllowedDirEntry,
    toRel, isInternal, isSitePath, buildTree,
    getExtensionClaimedExts, invalidateExtensionClaimedExts,
    onWorkspaceChangedGlobal, getHistoryService,
    startWatcher: (root) => fsService.startWatcher(root, () => mainWindow, { toRel }),
    stopWatcher: () => fsService.stopWatcher(),
    closeWorkspace,
    configureWindowOpenHandler,
    APP_ICON, DEV_URL,

    // Module-scoped maps used by extension/UI handlers
    getPendingPrompts: () => pendingPrompts,
    getStatusBarOverrides: () => statusBarOverrides,
    getExtensionActiveFile: () => extensionActiveFile,
  }
}

app.whenReady().then(() => {
  // Extensions are managed from the sidebar Extensions tab, so we don't need
  // an Extensions submenu. On macOS we still set the standard app menu
  // (Quit, Hide, etc.).
  Menu.setApplicationMenu(
    process.platform === 'darwin'
      ? Menu.buildFromTemplate([
          { role: 'appMenu' },
          { role: 'editMenu' },
          { role: 'windowMenu' },
        ])
      : null,
  )
  recentRemotes = new RecentRemotes(path.join(app.getPath('userData'), 'recent-remotes.json'))
  const deps = makeDeps()
  fsService.registerIpcHandlers(ipcMain, deps)
  serveService.registerIpcHandlers(ipcMain, deps)
  historyService.registerIpcHandlers(ipcMain, deps)
  sitesService.registerIpcHandlers(ipcMain, deps)
  dockService.registerIpcHandlers(ipcMain, deps)
  extService.registerIpcHandlers(ipcMain, deps)
  wsService.registerIpcHandlers(ipcMain, deps)
  registerLegacyServeBroadcast()
  registerExtensionHandlers()
  createWindow()
})

app.on('before-quit', () => {
  serve.stopAll().catch(() => {})
})

app.on('window-all-closed', () => {
  closeWorkspace()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
