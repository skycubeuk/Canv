const { app, BrowserWindow, Menu, ipcMain, nativeTheme, protocol, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const serve = require('./serve-folder.cjs')
const { createHistoryService } = require('./history-service.cjs')
const fsService       = require('./services/fs/index.cjs')
const serveService    = require('./services/serve/index.cjs')
const historyService  = require('./services/history/index.cjs')
const sitesService    = require('./services/sites/index.cjs')
const dockService     = require('./services/dock/index.cjs')
const extService      = require('./services/extensions/index.cjs')
const wsService       = require('./services/workspace/index.cjs')
const mcpService      = require('./services/mcp/index.cjs')
const uriDispatch     = require('./uri-dispatch.cjs')

let extensionRuntime = null
let trustStore = null
let workspaceRegistry = null
let mcpServiceInstance = null

// Set inside app.whenReady() so lifecycle handlers (window-all-closed,
// the main window's 'closed' event) can invoke workspace helpers via deps.
let DEPS = null

const APP_ICON = path.join(__dirname, '..', 'build', 'icon.png')

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
// Shape: { kind: 'local', root }
let WORKSPACE = null
let HISTORY = null
let mainWindow = null

function getHistoryService() {
  if (!WORKSPACE?.root) {
    throw new Error('History is not available (no workspace open)')
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
    if (workspaceRegistry && WORKSPACE?.root) {
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
  return WORKSPACE.root
}

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

function registerLegacyServeBroadcast() {
  // serve broadcasts: wire once at app startup. Remains in main.cjs until
  // the serve domain takes ownership of its broadcast lifecycle.
  serve.onStatusChange((s) => {
    let payload = s
    if (s.running && WORKSPACE?.root) {
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

// Persist the last applied titleBarOverlay colours so the next launch can
// paint the OS-drawn controls in the active theme's panel colour from the
// very first frame — avoiding the dark/light → real-theme flash while the
// renderer boots.
function overlayCachePath() {
  try { return path.join(app.getPath('userData'), 'titlebar-overlay.json') }
  catch { return null }
}
function readPersistedOverlay() {
  const p = overlayCachePath()
  if (!p) return null
  try {
    const raw = fs.readFileSync(p, 'utf8')
    const parsed = JSON.parse(raw)
    if (typeof parsed?.color === 'string' && typeof parsed?.symbolColor === 'string') {
      return { color: parsed.color, symbolColor: parsed.symbolColor }
    }
  } catch { /* missing or corrupt — fall through to defaults */ }
  return null
}
function writePersistedOverlay(overlay) {
  const p = overlayCachePath()
  if (!p) return
  try { fs.writeFileSync(p, JSON.stringify(overlay), 'utf8') }
  catch { /* best-effort cache; ignore */ }
}

function createWindow() {
  const darkOverlay = { color: '#101216', symbolColor: '#e7eaf0' }
  const lightOverlay = { color: '#f7f8fa', symbolColor: '#1f2937' }
  const fallbackOverlay = nativeTheme.shouldUseDarkColors ? darkOverlay : lightOverlay
  const initialOverlay = readPersistedOverlay() ?? fallbackOverlay

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#171717' : '#fafaf9',
    icon: APP_ICON,
    // Custom topbar takes over the title-bar role. On Linux/Windows the OS
    // overlays min/max/close at the right; on macOS the traffic lights
    // appear at the left. The renderer's <header> uses CSS env vars
    // (titlebar-area-x / -width) to leave room for the controls.
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...initialOverlay, height: 39 },
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

  // Keep the title-bar overlay colours in sync with OS dark/light mode.
  // (In-app theme switches inside the renderer don't fire this; that's
  // a follow-up IPC handler.)
  if (process.platform !== 'darwin') {
    const onThemeUpdated = () => {
      const c = nativeTheme.shouldUseDarkColors ? darkOverlay : lightOverlay
      try { win.setTitleBarOverlay({ ...c, height: 39 }) } catch { /* unsupported on some Linux WMs */ }
    }
    nativeTheme.on('updated', onThemeUpdated)
    win.on('closed', () => nativeTheme.off('updated', onThemeUpdated))
  }

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
    if (popoutWindow && !popoutWindow.isDestroyed()) {
      popoutWindow.destroy()
      popoutWindow = null
    }
    if (DEPS) {
      DEPS.closeWorkspace()
      // Tear down the workspaceContains evaluator. closeWorkspace nulls out
      // the watcher + workspaceRegistry, so setupWorkspaceContains hits its
      // "no watcher → dispose previous, return" branch and unwires the
      // chokidar 'add' listener + clears compiledGlobsByExt.
      const refresh = DEPS.getExtensionWorkspaceContainsRefresh?.()
      if (typeof refresh === 'function') {
        try { refresh() } catch { /* ignore — shutdown path */ }
      }
    }
  })
}

if (screenshotTheme === 'dark' || screenshotTheme === 'light') {
  // Drive nativeTheme so the BrowserWindow backgroundColor and OS chrome
  // match the requested theme from the very first paint.
  nativeTheme.themeSource = screenshotTheme
}

protocol.registerSchemesAsPrivileged([
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

// Set by services/extensions during registerIpcHandlers so the workspace-
// service can re-evaluate workspaceContains: activation when the user
// switches vault roots. Lives in main.cjs scope because it's shared
// between two service modules.
let extensionWorkspaceContainsRefresh = null

function makeDeps() {
  const deps = {
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
    getMcpService: () => mcpServiceInstance,

    // Shared helpers — passed by reference.
    requireWorkspace, safeResolve, isAllowedExt, isAllowedDirEntry,
    toRel, isInternal, isSitePath, buildTree,
    getExtensionClaimedExts, invalidateExtensionClaimedExts,
    getHistoryService,
    startWatcher: (root) => fsService.startWatcher(root, () => mainWindow, { toRel }),
    stopWatcher: () => fsService.stopWatcher(),
    getWatcher: () => fsService.getWatcher(),
    setExtensionWorkspaceContainsRefresh: (fn) => { extensionWorkspaceContainsRefresh = fn },
    getExtensionWorkspaceContainsRefresh: () => extensionWorkspaceContainsRefresh,
    configureWindowOpenHandler,
    APP_ICON, DEV_URL,
  }
  // Workspace lifecycle helpers live in services/workspace/ and need access
  // to deps itself, so bind them after the object literal is constructed.
  deps.closeWorkspace = () => wsService.closeWorkspace(deps)
  deps.onWorkspaceChangedGlobal = () => wsService.onWorkspaceChangedGlobal(deps)
  return deps
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
  // Register canv:// as the OS-level protocol handler before the window is
  // created. No-op in dev / `electron .` (gated inside the module) so an
  // installed packaged Canv on the same machine keeps owning the scheme.
  // If another Canv instance already holds the single-instance lock, the
  // module calls app.quit() and returns ok:false — bail out of whenReady
  // immediately so we don't register handlers or create a window during the
  // brief async window before the process exits.
  const protocolReg = uriDispatch.registerProtocolHandler({ app, getMainWindow: () => mainWindow })
  if (protocolReg && protocolReg.ok === false) return
  const deps = makeDeps()
  DEPS = deps
  fsService.registerIpcHandlers(ipcMain, deps)
  serveService.registerIpcHandlers(ipcMain, deps)
  historyService.registerIpcHandlers(ipcMain, deps)
  sitesService.registerIpcHandlers(ipcMain, deps)
  dockService.registerIpcHandlers(ipcMain, deps)
  extService.registerIpcHandlers(ipcMain, deps)
  wsService.registerIpcHandlers(ipcMain, deps)
  // Renderer pushes the active theme's surface + foreground colours so the
  // Chromium-drawn min/max/close overlay matches the in-app theme (not just
  // OS dark/light). No-op on macOS — traffic lights aren't recolourable.
  ipcMain.handle('canvWindow:setTitleBarOverlay', (_e, payload) => {
    if (process.platform === 'darwin') return false
    const w = mainWindow
    if (!w || w.isDestroyed()) return false
    const color = typeof payload?.color === 'string' ? payload.color : null
    const symbolColor = typeof payload?.symbolColor === 'string' ? payload.symbolColor : null
    if (!color || !symbolColor) return false
    try {
      w.setTitleBarOverlay({ color, symbolColor, height: 39 })
      writePersistedOverlay({ color, symbolColor })
      return true
    } catch { return false }
  })
  const { service: mcp } = mcpService.registerIpcHandlers(ipcMain, deps)
  mcpServiceInstance = mcp
  // Wire the runtime as the canv:// dispatcher. Now safe — extService has
  // constructed extensionRuntime and stashed it via deps.setExtensionRuntime.
  // Any URI queued during startup (Win/Linux first-launch argv) flushes here.
  uriDispatch.setDispatcher((uri) => {
    if (extensionRuntime) {
      extensionRuntime.activateByUri(uri).catch((e) => console.error('activateByUri failed:', e))
    }
  })
  registerLegacyServeBroadcast()
  createWindow()
})

app.on('before-quit', () => {
  serve.stopAll().catch(() => {})
  if (mcpServiceInstance && typeof mcpServiceInstance.shutdown === 'function') {
    mcpServiceInstance.shutdown().catch(() => {})
  }
})

app.on('window-all-closed', () => {
  if (DEPS) {
    DEPS.closeWorkspace()
    const refresh = DEPS.getExtensionWorkspaceContainsRefresh?.()
    if (typeof refresh === 'function') {
      try { refresh() } catch { /* ignore — shutdown path */ }
    }
  }
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
