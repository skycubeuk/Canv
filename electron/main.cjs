const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell } = require('electron')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const chokidar = require('chokidar')
const git = require('isomorphic-git')
const nodefs = require('node:fs')
const SSHConfig = require('ssh-config')
const { loadConfigDir } = require('./config-loader.cjs')
const { SshPool } = require('./ssh-pool.cjs')
const { RemoteFs } = require('./remote-fs.cjs')
const { parseTarget, resolveTarget } = require('./remote-target.cjs')
const { RecentRemotes } = require('./recent-remotes.cjs')
const serve = require('./serve-folder.cjs')
const siteRegistry = require('./site-registry.cjs')
const { maxMtimeForGlobs } = require('./glob-mtime.cjs')
const workspaceConfig = require('./workspace-config.cjs')
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
let watcher = null
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

function startWatcher(root) {
  stopWatcher()
  watcher = chokidar.watch(root, {
    ignored: (p) => {
      const base = path.basename(p)
      if (p === root) return false
      if (SKIP_DIRS.has(base)) return true
      // Hide dotfiles/folders from the tree, but still watch them so the
      // internal `.canv/context-cache.json` can react to external edits.
      // Chokidar will deliver events; the renderer filters by relPath as needed.
      return false
    },
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    depth: MAX_DEPTH,
  })
  const send = (type) => (absPath, stats) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    const rel = toRel(root, absPath)
    if (!rel) return
    mainWindow.webContents.send('canvFS:event', {
      type,
      relPath: rel,
      mtimeMs: stats?.mtimeMs,
    })
  }
  watcher
    .on('add', send('add'))
    .on('change', send('change'))
    .on('unlink', send('unlink'))
    .on('addDir', send('addDir'))
    .on('unlinkDir', send('unlinkDir'))
    .on('error', () => { /* swallow */ })
}

function stopWatcher() {
  if (watcher) {
    watcher.close().catch(() => {})
    watcher = null
  }
}

async function closeWorkspace() {
  await serve.stop()
  if (!WORKSPACE) return
  if (WORKSPACE.kind === 'local') {
    stopWatcher()
  } else if (WORKSPACE.kind === 'remote') {
    if (WORKSPACE.unsub) { try { WORKSPACE.unsub() } catch { /* ignore */ } }
    try { await WORKSPACE.pool.close() } catch { /* ignore */ }
  }
  WORKSPACE = null
  HISTORY = null
}

function registerFsHandlers() {
  ipcMain.handle('canvFS:pickWorkspace', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose Canv workspace folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const root = result.filePaths[0]
    await closeWorkspace()
    WORKSPACE = { kind: 'local', root }
    HISTORY = null
    startWatcher(root)
    onWorkspaceChangedGlobal()
    return { root }
  })

  ipcMain.handle('canvFS:setWorkspace', async (_e, root) => {
    if (typeof root !== 'string' || !root) throw new Error('invalid root')
    const stat = await fsp.stat(root).catch(() => null)
    if (!stat || !stat.isDirectory()) throw new Error('workspace folder does not exist')
    await closeWorkspace()
    WORKSPACE = { kind: 'local', root }
    HISTORY = null
    startWatcher(root)
    onWorkspaceChangedGlobal()
  })

  ipcMain.handle('canvFS:getWorkspace', async () => WORKSPACE?.kind === 'local' ? WORKSPACE.root : null)

  ipcMain.handle('canvFS:listDir', async (_e, rel = '') => {
    if (isRemote()) return WORKSPACE.backend.listDir(rel || '')
    const root = requireWorkspace()
    return buildTree(root, rel || '', 0)
  })

  ipcMain.handle('canvFS:readFile', async (_e, rel) => {
    if (isRemote()) {
      const { content, mtimeMs } = await WORKSPACE.backend.readFile(rel)
      return {
        ok: true,
        content,
        mtimeMs,
        eol: 'lf',
        bom: false,
        size: Buffer.byteLength(content, 'utf8'),
      }
    }
    const root = requireWorkspace()
    const abs = safeResolve(root, rel)
    const stat = await fsp.stat(abs)
    if (!stat.isFile()) throw new Error('not a file')
    if (stat.size > MAX_OPEN_BYTES) {
      return { ok: false, error: 'too-large', size: stat.size, mtimeMs: stat.mtimeMs }
    }
    if (!isAllowedExt(rel, abs)) throw new Error('binary or unsupported file type')

    let buf = await fsp.readFile(abs)
    let bom = false
    if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
      bom = true
      buf = buf.subarray(3)
    }

    let content
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(buf)
    } catch {
      return { ok: false, error: 'not-utf8', size: stat.size, mtimeMs: stat.mtimeMs }
    }

    const scan = content.length > 65536 ? content.slice(0, 65536) : content
    const eol = scan.includes('\r\n') ? 'crlf' : 'lf'
    const normalised = eol === 'crlf' ? content.replace(/\r\n/g, '\n') : content

    return { ok: true, content: normalised, mtimeMs: stat.mtimeMs, eol, bom, size: stat.size }
  })

  ipcMain.handle('canvFS:writeFile', async (_e, rel, content, expectedMtimeMs, opts) => {
    if (isRemote()) return WORKSPACE.backend.writeFile(rel, content, expectedMtimeMs)
    const root = requireWorkspace()
    const abs = safeResolve(root, rel)
    if (!isAllowedExt(rel, abs)) throw new Error('unsupported file type')
    if (typeof content !== 'string') throw new Error('invalid content')

    const wantEol = opts && opts.eol === 'crlf' ? 'crlf' : 'lf'
    const wantBom = !!(opts && opts.bom)

    const out = wantEol === 'crlf' ? content.replace(/\n/g, '\r\n') : content
    let buffer = Buffer.from(out, 'utf8')
    if (wantBom) buffer = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), buffer])
    if (buffer.byteLength > MAX_OPEN_BYTES) throw new Error('content too large')

    if (typeof expectedMtimeMs === 'number') {
      const stat = await fsp.stat(abs).catch(() => null)
      if (stat && Math.abs(stat.mtimeMs - expectedMtimeMs) > 1) {
        const err = new Error('stale write')
        err.code = 'STALE'
        throw err
      }
    }
    await fsp.mkdir(path.dirname(abs), { recursive: true })
    await fsp.writeFile(abs, buffer)
    const stat = await fsp.stat(abs)
    return { mtimeMs: stat.mtimeMs }
  })

  ipcMain.handle('canvFS:createFile', async (_e, rel, content = '') => {
    if (isRemote()) return WORKSPACE.backend.createFile(rel, content)
    const root = requireWorkspace()
    const abs = safeResolve(root, rel)
    if (!isAllowedExt(rel, abs)) throw new Error('unsupported file type')
    try {
      await fsp.access(abs)
      throw new Error('file already exists')
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
    await fsp.mkdir(path.dirname(abs), { recursive: true })
    await fsp.writeFile(abs, content, { encoding: 'utf8', flag: 'wx' })
    const stat = await fsp.stat(abs)
    return { mtimeMs: stat.mtimeMs }
  })

  ipcMain.handle('canvFS:createFolder', async (_e, rel) => {
    if (isRemote()) return WORKSPACE.backend.createFolder(rel)
    const root = requireWorkspace()
    const abs = safeResolve(root, rel)
    await fsp.mkdir(abs, { recursive: true })
  })

  ipcMain.handle('canvFS:rename', async (_e, oldRel, newRel) => {
    if (isRemote()) return WORKSPACE.backend.rename(oldRel, newRel)
    const root = requireWorkspace()
    const oldAbs = safeResolve(root, oldRel)
    const newAbs = safeResolve(root, newRel)
    const stat = await fsp.stat(oldAbs)
    if (stat.isFile() && !isAllowedExt(newRel, newAbs)) throw new Error('unsupported file type')
    await fsp.mkdir(path.dirname(newAbs), { recursive: true })
    await fsp.rename(oldAbs, newAbs)
  })

  ipcMain.handle('canvFS:delete', async (_e, rel) => {
    if (isRemote()) return WORKSPACE.backend.delete(rel)
    const root = requireWorkspace()
    const abs = safeResolve(root, rel)
    if (abs === root) throw new Error('cannot delete workspace root')
    let stat
    try { stat = await fsp.lstat(abs) }
    catch (err) { if (err && err.code === 'ENOENT') return; throw err }
    try {
      await shell.trashItem(abs)
    } catch {
      // Fallback for environments where trash is unavailable
      if (stat.isDirectory()) await fsp.rm(abs, { recursive: true, force: true })
      else await fsp.unlink(abs)
    }
  })

  // Search across workspace markdown files. Single-invoke; main process walks
  // the workspace tree, opens each .md file (capped at 1 MB), runs the matcher
  // line-by-line, and returns up to SEARCH_MAX_MATCHES matches.
  const SEARCH_MAX_FILE_BYTES = 1024 * 1024
  const SEARCH_MAX_MATCHES = 1000
  const SEARCH_SNIPPET_LIMIT = 240 // chars

  ipcMain.handle('canvFS:search', async (_e, query) => {
    if (isRemote()) return WORKSPACE.backend.search(query)
    const root = requireWorkspace()
    if (!query || typeof query.query !== 'string' || query.query.length === 0) {
      return { matches: [], truncated: false }
    }

    let pattern
    try {
      pattern = buildSearchPattern(query)
    } catch {
      // Invalid regex — surface as zero matches; renderer shows "invalid pattern"
      // by checking the query separately before calling.
      return { matches: [], truncated: false }
    }

    const folderPrefix = typeof query.folder === 'string' ? query.folder.replace(/^\/+|\/+$/g, '') : ''
    const matches = []
    let truncated = false

    async function walk(absDir, relDir, depth) {
      if (truncated) return
      if (depth > MAX_DEPTH) return
      let entries
      try {
        entries = await fsp.readdir(absDir, { withFileTypes: true })
      } catch {
        return
      }
      entries.sort((a, b) => a.name.localeCompare(b.name))
      for (const ent of entries) {
        if (truncated) break
        if (!isAllowedDirEntry(ent.name)) continue
        const childAbs = path.join(absDir, ent.name)
        const childRel = relDir ? `${relDir}/${ent.name}` : ent.name
        if (ent.isDirectory()) {
          await walk(childAbs, childRel, depth + 1)
          continue
        }
        if (!ent.isFile()) continue
        if (!/\.(md|markdown)$/i.test(ent.name)) continue
        if (folderPrefix && !childRel.startsWith(folderPrefix)) continue
        let stat
        try { stat = await fsp.stat(childAbs) } catch { continue }
        if (stat.size > SEARCH_MAX_FILE_BYTES) continue
        let text
        try { text = await fsp.readFile(childAbs, 'utf-8') } catch { continue }
        const lines = text.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (truncated) break
          const line = lines[i]
          // Reset regex `lastIndex` between lines so `g` flag works.
          pattern.lastIndex = 0
          let m
          while ((m = pattern.exec(line)) !== null) {
            if (m[0].length === 0) {
              // Zero-width match — bail to avoid infinite loop.
              pattern.lastIndex = m.index + 1
              continue
            }
            const snippet = line.length > SEARCH_SNIPPET_LIMIT
              ? line.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40)
              : line
            matches.push({
              rel: childRel,
              line: i,
              col: m.index,
              matchLen: m[0].length,
              snippet,
            })
            if (matches.length >= SEARCH_MAX_MATCHES) {
              truncated = true
              break
            }
          }
        }
      }
    }

    await walk(root, '', 0)
    return { matches, truncated }
  })

  // ---------------------------------------------------------------------------
  // Workspace config (local-only)
  // ---------------------------------------------------------------------------

  ipcMain.handle('canvFS:readWorkspaceConfig', async () => {
    const root = WORKSPACE?.kind === 'local' ? WORKSPACE.root : null
    if (!root) return null
    return workspaceConfig.readWorkspaceConfig(root)
  })

  ipcMain.handle('canvFS:writeWorkspaceConfig', async (_e, cfg) => {
    if (isRemote()) throw new Error('Workspace config is local-only')
    const root = WORKSPACE?.kind === 'local' ? WORKSPACE.root : null
    if (!root) throw new Error('No workspace open')
    await workspaceConfig.writeWorkspaceConfig(root, cfg)
    return true
  })

  // ---------------------------------------------------------------------------
  // Git integration (isomorphic-git — pure JS, no system git required)
  // ---------------------------------------------------------------------------

  ipcMain.handle('canvFS:gitStatus', async () => {
    if (isRemote()) return WORKSPACE.backend.gitStatus()
    const root = requireWorkspace()

    // Detect .git presence — isomorphic-git throws when .git is absent, which
    // is expected for non-repo workspaces; surface as the empty-state payload.
    const dotGit = path.join(root, '.git')
    try {
      const s = await fsp.stat(dotGit)
      if (!s.isDirectory()) return { branch: null, changed: [], staged: [], untracked: [], noRepo: true }
    } catch {
      return { branch: null, changed: [], staged: [], untracked: [], noRepo: true }
    }

    let branch = null
    try {
      branch = await git.currentBranch({ fs: nodefs, dir: root, fullname: false }) ?? null
    } catch {
      branch = null
    }

    // statusMatrix returns an array of [filepath, HEAD, workdir, stage] tuples.
    // Encoding reference (isomorphic-git docs):
    //   HEAD:    0 = absent, 1 = present
    //   workdir: 0 = absent, 1 = identical to HEAD, 2 = different from HEAD
    //   stage:   0 = absent, 1 = identical to HEAD, 2 = different from HEAD, 3 = different from workdir
    let matrix
    try {
      matrix = await git.statusMatrix({ fs: nodefs, dir: root })
    } catch {
      return { branch, changed: [], staged: [], untracked: [] }
    }

    const changed = []
    const staged = []
    const untracked = []

    for (const [filepath, head, workdir, stage] of matrix) {
      const rel = filepath.replace(/\\/g, '/')
      // Untracked: absent from HEAD and stage, present in workdir.
      if (head === 0 && stage === 0 && workdir === 2) {
        untracked.push({ relPath: rel, status: 'untracked' })
        continue
      }
      // Staged new file: absent from HEAD, present in stage.
      if (head === 0 && stage === 2) {
        staged.push({ relPath: rel, status: 'added' })
        continue
      }
      // Deleted from working tree: present in HEAD, absent in workdir.
      if (head === 1 && workdir === 0) {
        changed.push({ relPath: rel, status: 'deleted' })
        continue
      }
      // Modified working tree: present in HEAD, differs in workdir.
      if (head === 1 && workdir === 2) {
        changed.push({ relPath: rel, status: 'modified' })
        continue
      }
      // Staged deletion: present in HEAD, absent in stage and workdir.
      if (head === 1 && stage === 0) {
        staged.push({ relPath: rel, status: 'deleted' })
        continue
      }
      // Staged modification: present in HEAD, stage differs from HEAD.
      if (head === 1 && stage === 2) {
        staged.push({ relPath: rel, status: 'modified' })
        continue
      }
    }

    changed.sort((a, b) => a.relPath.localeCompare(b.relPath))
    staged.sort((a, b) => a.relPath.localeCompare(b.relPath))
    untracked.sort((a, b) => a.relPath.localeCompare(b.relPath))

    return { branch, changed, staged, untracked }
  })

  ipcMain.handle('canvFS:gitDiff', async (_e, rel, baseRef) => {
    if (isRemote()) return WORKSPACE.backend.gitDiff(rel, baseRef)
    const root = requireWorkspace()
    if (typeof rel !== 'string' || !rel) throw new Error('invalid rel')
    const ref = (typeof baseRef === 'string' && baseRef) ? baseRef : 'HEAD'

    // Read working-tree content (may be deleted).
    const abs = safeResolve(root, rel)
    let currentText = ''
    try {
      const stat = await fsp.stat(abs)
      if (stat.isFile() && stat.size <= MAX_OPEN_BYTES) {
        currentText = await fsp.readFile(abs, 'utf-8')
      }
    } catch {
      currentText = ''
    }

    // Read base-ref blob via isomorphic-git.
    let baseText = ''
    try {
      // resolveRef + readBlob: get the SHA for the file at ref, then read the blob.
      const commits = await git.log({ fs: nodefs, dir: root, ref, depth: 1 })
      if (commits.length > 0) {
        const { blob } = await git.readBlob({
          fs: nodefs,
          dir: root,
          oid: commits[0].oid,
          filepath: rel,
        })
        baseText = Buffer.from(blob).toString('utf-8')
      }
    } catch {
      // File may not exist at the ref (new file) — baseText stays ''.
      baseText = ''
    }

    return { relPath: rel, baseRef: ref, baseText, currentText }
  })

  ipcMain.handle('canvConfig:list', async () => {
    const userDataDir = app.getPath('userData')
    const { configDir, files } = loadConfigDir({ userDataDir })
    return { configDir, files }
  })

  ipcMain.handle('canvConfig:revealFolder', async () => {
    const userDataDir = app.getPath('userData')
    const configDir = path.join(userDataDir, 'config')
    await shell.openPath(configDir)
  })

  // Factory reset: delete every Canv-owned file under userData so the next
  // launch sees first-run state. Defaults will be re-seeded by loadConfigDir.
  // Renderer is responsible for wiping its own localStorage before/after.
  ipcMain.handle('canvConfig:factoryReset', async () => {
    const userDataDir = app.getPath('userData')
    const configDir = path.join(userDataDir, 'config')
    const recentRemotesFile = path.join(userDataDir, 'recent-remotes.json')
    fs.rmSync(configDir, { recursive: true, force: true })
    fs.rmSync(recentRemotesFile, { force: true })
    return { ok: true }
  })

  ipcMain.handle('canvFS:closeWorkspace', async () => {
    await closeWorkspace()
    onWorkspaceChangedGlobal()
  })

  ipcMain.handle('canvFS:listRecentRemotes', async () => recentRemotes ? recentRemotes.list() : [])

  ipcMain.handle('canvFS:openRemote', async (_e, raw) => {
    if (typeof raw !== 'string' || !raw.trim()) throw new Error('invalid target')
    const target = parseTarget(raw)
    let cfgLookup = () => null
    try {
      const cfgText = fs.readFileSync(path.join(os.homedir(), '.ssh/config'), 'utf8')
      const parsed = SSHConfig.parse(cfgText)
      cfgLookup = (host) => {
        const r = parsed.compute(host)
        return r && Object.keys(r).length ? r : null
      }
    } catch { /* no ssh config — fine */ }
    const resolved = resolveTarget(target, cfgLookup)
    const pool = new SshPool({
      host: resolved.host,
      port: resolved.port || 22,
      user: resolved.user,
      auth: { agent: process.env.SSH_AUTH_SOCK },
    })
    // Preflight: check tools exist on remote
    let pf
    try {
      pf = await pool.exec('command -v inotifywait git rg grep || true; uname -s')
    } catch (e) {
      await pool.close()
      const msg = e.message || String(e)
      if (/host\s*key/i.test(msg) || /verification/i.test(msg)) {
        throw new Error(`Host key for ${resolved.host} not in ~/.ssh/known_hosts. Run "ssh ${resolved.user || ''}${resolved.user ? '@' : ''}${resolved.host}" in a terminal first to accept the host key.`)
      }
      throw new Error('SSH connection failed: ' + msg)
    }
    const tools = pf.stdout.split('\n').map((l) => l.trim()).filter(Boolean)
    const has = (n) => tools.some((p) => p === n || p.endsWith('/' + n))
    if (!has('inotifywait')) { await pool.close(); throw new Error('remote is missing inotifywait — install inotify-tools') }
    if (!has('git')) { await pool.close(); throw new Error('remote is missing git') }
    const rfs = new RemoteFs({
      pool,
      rootPath: resolved.path,
      preflight: { hasRg: has('rg'), hasGrep: has('grep') },
    })
    await closeWorkspace()
    WORKSPACE = { kind: 'remote', target: resolved, raw, pool, backend: rfs }
    HISTORY = null
    onWorkspaceChangedGlobal()
    WORKSPACE.unsub = rfs.subscribe((ev) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('canvFS:event', ev)
    })
    pool.on('disconnect', () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('canvFS:status', { kind: 'remote', state: 'offline' })
    })
    pool.on('connected', () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('canvFS:status', { kind: 'remote', state: 'online' })
    })
    if (recentRemotes) recentRemotes.record(raw)
    return { kind: 'remote', display: `${resolved.user || ''}@${resolved.host}:${resolved.path}`.replace(/^@/, '') }
  })

  ipcMain.handle('canvFS:getWorkspaceKind', async () => {
    if (!WORKSPACE) return null
    if (WORKSPACE.kind === 'local') return { kind: 'local', root: WORKSPACE.root }
    return { kind: 'remote', display: `${WORKSPACE.target.user || ''}@${WORKSPACE.target.host}:${WORKSPACE.target.path}`.replace(/^@/, '') }
  })

  ipcMain.handle('canvFS:reconnect', () => {
    if (WORKSPACE?.kind === 'remote') WORKSPACE.pool.reconnectNow()
  })

  ipcMain.handle('canvServe:start', async (_e, relPath) => {
    if (typeof relPath !== 'string') throw new Error('relPath required')
    if (!WORKSPACE || WORKSPACE.kind !== 'local') throw new Error('serve requires a local workspace')
    const absRoot = path.resolve(path.join(WORKSPACE.root, relPath))
    // Defence-in-depth: relPath should not allow escaping the workspace.
    const resolvedWs = path.resolve(WORKSPACE.root)
    if (absRoot !== resolvedWs && !absRoot.startsWith(resolvedWs + path.sep)) {
      throw new Error('serve target must be inside workspace')
    }
    try {
      const { url } = await serve.start(absRoot)
      shell.openExternal(url).catch(() => {})
      return { url }
    } catch (err) {
      if (err && err.code === 'NO_INDEX') return { error: 'NO_INDEX' }
      throw err
    }
  })
  ipcMain.handle('canvServe:stop', async () => { await serve.stop(); return null })
  ipcMain.handle('canvServe:status', () => {
    const s = serve.status()
    if (s.running && WORKSPACE && WORKSPACE.kind === 'local') {
      const resolvedWs = path.resolve(WORKSPACE.root)
      const rel = path.relative(resolvedWs, s.root).split(path.sep).join('/')
      return { ...s, relPath: rel }
    }
    return s
  })

  // Revision Archaeology — local-only history backed by isomorphic-git on
  // a dedicated canv-history branch. See electron/history-service.cjs.
  ipcMain.handle('canvHistory:init', async () => getHistoryService().initRevisionArchaeology())
  ipcMain.handle('canvHistory:createSnapshot', async (_e, input) => getHistoryService().createSnapshot(input))
  ipcMain.handle('canvHistory:listSnapshots', async (_e, opts) => getHistoryService().listSnapshots(opts))
  ipcMain.handle('canvHistory:getSnapshot', async (_e, id) => getHistoryService().getSnapshot(id))
  ipcMain.handle('canvHistory:getSnapshotByCommit', async (_e, sha) => getHistoryService().getSnapshotByCommit(sha))
  ipcMain.handle('canvHistory:diffSnapshot', async (_e, id, rel) => getHistoryService().diffSnapshot(id, rel))
  ipcMain.handle('canvHistory:diffCurrent', async (_e, rel) => getHistoryService().diffCurrent(rel))
  ipcMain.handle('canvHistory:getCurrentChanges', async () => getHistoryService().getCurrentChanges())
  ipcMain.handle('canvHistory:restoreFilePreview', async (_e, id, rel) => getHistoryService().restoreFilePreview(id, rel))
  ipcMain.handle('canvHistory:restoreFile', async (_e, id, rel) => getHistoryService().restoreFile(id, rel))
  ipcMain.handle('canvHistory:hideSnapshot', async (_e, id) => getHistoryService().hideSnapshot(id))
  ipcMain.handle('canvHistory:patchSnapshotFiles', async (_e, id, files) =>
    getHistoryService().patchSnapshotFiles(id, files))
  ipcMain.handle('canvHistory:getTipCommit', async () => getHistoryService().getTipCommit())
  ipcMain.handle('canvHistory:getSnapshotDelta', async (_e, id) => getHistoryService().getSnapshotDelta(id))
  ipcMain.handle('canvHistory:getFileHistory', async (_e, rel) => getHistoryService().getFileHistory(rel))

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

function workspaceRootOrThrow() {
  if (WORKSPACE?.kind !== 'local') throw new Error('Sites are only available in local workspaces')
  return WORKSPACE.root
}

function emitRegistryChanged() {
  for (const w of BrowserWindow.getAllWindows()) {
    try { w.webContents.send('canvSites:registryChanged') } catch { /* ignore */ }
  }
}

function registerSiteHandlers() {
  ipcMain.handle('canvSites:list', () => {
    const root = workspaceRootOrThrow()
    return siteRegistry.list(root)
  })

  ipcMain.handle('canvSites:register', async (_e, input) => {
    const root = workspaceRootOrThrow()
    const entry = siteRegistry.register(root, input)
    const absSiteRoot = path.join(root, entry.folder)
    const mounted = await serve.mountSite(entry.id, absSiteRoot)
    emitRegistryChanged()
    return { entry, url: mounted.url + (entry.entry === 'index.html' ? '' : entry.entry) }
  })

  ipcMain.handle('canvSites:update', async (_e, id, patch) => {
    const root = workspaceRootOrThrow()
    const entry = siteRegistry.update(root, id, patch)
    emitRegistryChanged()
    return entry
  })

  ipcMain.handle('canvSites:open', async (_e, id) => {
    const root = workspaceRootOrThrow()
    const entry = siteRegistry.get(root, id)
    if (!entry) throw new Error('Unknown site id')
    const absSiteRoot = path.join(root, entry.folder)
    if (!fs.existsSync(absSiteRoot)) throw new Error('Site folder is missing')
    const mounted = await serve.mountSite(entry.id, absSiteRoot)
    const url = mounted.url + (entry.entry === 'index.html' ? '' : entry.entry)
    await shell.openExternal(url)
    return { url }
  })

  ipcMain.handle('canvSites:delete', async (_e, id) => {
    const root = workspaceRootOrThrow()
    const entry = siteRegistry.get(root, id)
    if (!entry) return null
    await serve.unmountSite(id)
    siteRegistry.unregister(root, id)
    const absSiteRoot = path.join(root, entry.folder)
    try { fs.rmSync(absSiteRoot, { recursive: true, force: true }) } catch { /* ignore */ }
    emitRegistryChanged()
    return null
  })

  ipcMain.handle('canvSites:setPinned', async (_e, id, pinned) => {
    const root = workspaceRootOrThrow()
    const entry = siteRegistry.update(root, id, { pinned: Boolean(pinned) })
    emitRegistryChanged()
    return entry
  })

  ipcMain.handle('canvSites:listWithStaleness', () => {
    const root = workspaceRootOrThrow()
    const entries = siteRegistry.list(root)
    return entries.map((e) => {
      const updatedMs = Date.parse(e.updated) || 0
      const max = maxMtimeForGlobs(root, e.source_files || [])
      return { ...e, stale: max > updatedMs }
    })
  })
}

let popoutWindow = null

function broadcastToMainWindow(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

function broadcastToPopout(channel, payload) {
  if (popoutWindow && !popoutWindow.isDestroyed()) {
    popoutWindow.webContents.send(channel, payload)
  }
}

function registerDockHandlers() {
  ipcMain.handle('canvDock:openPopout', async () => {
    if (popoutWindow && !popoutWindow.isDestroyed()) {
      popoutWindow.focus()
      return
    }
    const win = new BrowserWindow({
      width: 600,
      height: 800,
      minWidth: 360,
      minHeight: 320,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#171717' : '#fafaf9',
      title: 'Canv Dock',
      icon: APP_ICON,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    popoutWindow = win
    configureWindowOpenHandler(win)

    if (app.isPackaged) {
      const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
      await win.loadFile(indexPath, { search: 'mode=dock' })
    } else {
      await win.loadURL(`${DEV_URL}?mode=dock`)
    }

    win.on('closed', () => {
      if (popoutWindow === win) popoutWindow = null
      broadcastToMainWindow('canvDock:popoutClosed')
    })
  })

  ipcMain.handle('canvDock:closePopout', async () => {
    if (popoutWindow && !popoutWindow.isDestroyed()) {
      popoutWindow.destroy()
    }
    popoutWindow = null
  })

  // Relay: main renderer pushes state → forward to popout.
  ipcMain.on('canvDock:state', (_e, state) => {
    broadcastToPopout('canvDock:state', state)
  })

  // Relay: popout sends user action → forward to main renderer.
  ipcMain.on('canvDock:userAction', (_e, action) => {
    broadcastToMainWindow('canvDock:userAction', action)
  })

  // Relay: popout signals ready → tell main renderer so it can push an immediate snapshot.
  ipcMain.on('canvDock:ready', () => {
    broadcastToMainWindow('canvDock:popoutReady')
  })
}

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
    await extensionRuntime.spawn({
      extensionDir: dir, manifest, hostWindow: mainWindow, bounds,
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

  ipcMain.handle('canvExtensions:showPanelInSlot', async (_e, slotId, bounds) => {
    if (!extensionRuntime || !workspaceRegistry) return { ok: false, error: 'no runtime' }
    const m = /^ext:([^:]+):([^:]+)$/.exec(slotId)
    if (!m) return { ok: false, error: 'malformed slotId' }
    const [, extensionId] = m
    if (extensionRuntime.manifestFor(extensionId)) {
      extensionRuntime.setBounds(extensionId, bounds)
      return { ok: true }
    }
    return await spawnInstalled(extensionId, { bounds })
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
  registerFsHandlers()
  registerSiteHandlers()
  registerDockHandlers()
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
