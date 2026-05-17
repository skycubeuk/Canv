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
const MAX_READ_BYTES = 2 * 1024 * 1024
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

function isAllowedExt(rel, abs) {
  const ext = path.extname(abs).toLowerCase()
  if (rel === '.canv/site_index.yaml') return ext === '.yaml'
  if (isSitePath(rel)) return SITE_EXTS.has(ext)
  if (isInternal(rel)) return INTERNAL_EXTS.has(ext)
  return PUBLIC_EXTS.has(ext)
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
  })

  ipcMain.handle('canvFS:getWorkspace', async () => WORKSPACE?.kind === 'local' ? WORKSPACE.root : null)

  ipcMain.handle('canvFS:listDir', async (_e, rel = '') => {
    if (isRemote()) return WORKSPACE.backend.listDir(rel || '')
    const root = requireWorkspace()
    return buildTree(root, rel || '', 0)
  })

  ipcMain.handle('canvFS:readFile', async (_e, rel) => {
    if (isRemote()) return WORKSPACE.backend.readFile(rel)
    const root = requireWorkspace()
    const abs = safeResolve(root, rel)
    const stat = await fsp.stat(abs)
    if (!stat.isFile()) throw new Error('not a file')
    if (stat.size > MAX_READ_BYTES) throw new Error('file too large')
    if (!isAllowedExt(rel, abs)) throw new Error('binary or unsupported file type')
    const content = await fsp.readFile(abs, 'utf8')
    return { content, mtimeMs: stat.mtimeMs }
  })

  ipcMain.handle('canvFS:writeFile', async (_e, rel, content, expectedMtimeMs) => {
    if (isRemote()) return WORKSPACE.backend.writeFile(rel, content, expectedMtimeMs)
    const root = requireWorkspace()
    const abs = safeResolve(root, rel)
    if (!isAllowedExt(rel, abs)) throw new Error('unsupported file type')
    if (typeof content !== 'string') throw new Error('invalid content')
    if (Buffer.byteLength(content, 'utf8') > MAX_READ_BYTES) throw new Error('content too large')
    if (typeof expectedMtimeMs === 'number') {
      const stat = await fsp.stat(abs).catch(() => null)
      if (stat && Math.abs(stat.mtimeMs - expectedMtimeMs) > 1) {
        const err = new Error('stale write')
        err.code = 'STALE'
        throw err
      }
    }
    await fsp.mkdir(path.dirname(abs), { recursive: true })
    await fsp.writeFile(abs, content, 'utf8')
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
      if (stat.isFile() && stat.size <= MAX_READ_BYTES) {
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

  ipcMain.handle('canvFS:closeWorkspace', () => closeWorkspace())

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

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  recentRemotes = new RecentRemotes(path.join(app.getPath('userData'), 'recent-remotes.json'))
  registerFsHandlers()
  registerSiteHandlers()
  registerDockHandlers()
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
