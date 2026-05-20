'use strict'

const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const chokidar = require('chokidar')
const git = require('isomorphic-git')
const nodefs = require('node:fs')
const SSHConfig = require('ssh-config')
const { app, dialog, shell } = require('electron')
const { loadConfigDir } = require('../../config-loader.cjs')
const { SshPool } = require('../../ssh-pool.cjs')
const { RemoteFs } = require('../../remote-fs.cjs')
const { parseTarget, resolveTarget } = require('../../remote-target.cjs')
const workspaceConfig = require('../../workspace-config.cjs')
const { MAX_OPEN_BYTES } = require('../fs-limits.cjs')
const {
  canvFSReadFile: canvFSReadFileImpl,
  canvFSWriteFile: canvFSWriteFileImpl,
} = require('../canvfs.cjs')

// FS-domain constants. Mirrors the main.cjs originals; only the watcher and
// in-domain search use these — main.cjs keeps its own copies for buildTree /
// isAllowedExt / isAllowedDirEntry which still live there for cross-domain use.
const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', '.DS_Store'])
const MAX_DEPTH = 8

let watcher = null

function startWatcher(root, getMainWindow, deps) {
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
    const win = getMainWindow()
    if (!win || win.isDestroyed()) return
    const rel = deps.toRel(root, absPath)
    if (!rel) return
    win.webContents.send('canvFS:event', {
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

function getWatcher() {
  return watcher
}

function buildSearchPattern(q) {
  const flags = q.caseSensitive ? 'g' : 'gi'
  if (q.regex) return new RegExp(q.query, flags)
  const escaped = q.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(escaped, flags)
}

/**
 * fs IPC handlers. Called once at app.whenReady from electron/main.cjs.
 * The `deps` object exposes getters for module-scoped state (live values,
 * since workspaces switch at runtime) and shared utilities.
 */
function registerIpcHandlers(ipcMain, deps) {
  // -------------------------------------------------------------------------
  // canvConfig:* — moved in Task 22
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // canvFS:* — moved in Task 26
  // -------------------------------------------------------------------------

  ipcMain.handle('canvFS:pickWorkspace', async () => {
    const mainWindow = deps.getMainWindow()
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose Canv workspace folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    const root = result.filePaths[0]
    await deps.closeWorkspace()
    deps.setWorkspace({ kind: 'local', root })
    deps.setHistory(null)
    startWatcher(root, deps.getMainWindow, deps)
    deps.onWorkspaceChangedGlobal()
    return { root }
  })

  ipcMain.handle('canvFS:setWorkspace', async (_e, root) => {
    if (typeof root !== 'string' || !root) throw new Error('invalid root')
    const stat = await fsp.stat(root).catch(() => null)
    if (!stat || !stat.isDirectory()) throw new Error('workspace folder does not exist')
    await deps.closeWorkspace()
    deps.setWorkspace({ kind: 'local', root })
    deps.setHistory(null)
    startWatcher(root, deps.getMainWindow, deps)
    deps.onWorkspaceChangedGlobal()
  })

  ipcMain.handle('canvFS:getWorkspace', async () => {
    const ws = deps.getWorkspace()
    return ws?.kind === 'local' ? ws.root : null
  })

  ipcMain.handle('canvFS:listDir', async (_e, rel = '') => {
    const ws = deps.getWorkspace()
    if (deps.isRemote()) return ws.backend.listDir(rel || '')
    const root = deps.requireWorkspace()
    return deps.buildTree(root, rel || '', 0)
  })

  ipcMain.handle('canvFS:readFile', async (_e, rel) => {
    // Remote backend returns the legacy { content, mtimeMs } shape; we synthesise
    // eol/bom defaults at this boundary. Updating the remote contract is a future task.
    if (deps.isRemote()) {
      const ws = deps.getWorkspace()
      const { content, mtimeMs } = await ws.backend.readFile(rel)
      return {
        ok: true,
        content,
        mtimeMs,
        eol: 'lf',
        bom: false,
        size: Buffer.byteLength(content, 'utf8'),
      }
    }
    const root = deps.requireWorkspace()
    return canvFSReadFileImpl(root, rel, { safeResolve: deps.safeResolve, isAllowedExt: deps.isAllowedExt })
  })

  ipcMain.handle('canvFS:writeFile', async (_e, rel, content, expectedMtimeMs, opts) => {
    // TODO(remote-fs): SSH backend does not yet honour { eol, bom };
    // CRLF/BOM files saved to a remote workspace currently re-encode to LF/no-BOM.
    if (deps.isRemote()) {
      const ws = deps.getWorkspace()
      return ws.backend.writeFile(rel, content, expectedMtimeMs)
    }
    const root = deps.requireWorkspace()
    return canvFSWriteFileImpl(root, rel, content, expectedMtimeMs, opts, {
      safeResolve: deps.safeResolve,
      isAllowedExt: deps.isAllowedExt,
    })
  })

  ipcMain.handle('canvFS:createFile', async (_e, rel, content = '') => {
    if (deps.isRemote()) {
      const ws = deps.getWorkspace()
      return ws.backend.createFile(rel, content)
    }
    const root = deps.requireWorkspace()
    const abs = deps.safeResolve(root, rel)
    if (!deps.isAllowedExt(rel, abs)) throw new Error('unsupported file type')
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
    if (deps.isRemote()) {
      const ws = deps.getWorkspace()
      return ws.backend.createFolder(rel)
    }
    const root = deps.requireWorkspace()
    const abs = deps.safeResolve(root, rel)
    await fsp.mkdir(abs, { recursive: true })
  })

  ipcMain.handle('canvFS:rename', async (_e, oldRel, newRel) => {
    if (deps.isRemote()) {
      const ws = deps.getWorkspace()
      return ws.backend.rename(oldRel, newRel)
    }
    const root = deps.requireWorkspace()
    const oldAbs = deps.safeResolve(root, oldRel)
    const newAbs = deps.safeResolve(root, newRel)
    const stat = await fsp.stat(oldAbs)
    if (stat.isFile() && !deps.isAllowedExt(newRel, newAbs)) throw new Error('unsupported file type')
    await fsp.mkdir(path.dirname(newAbs), { recursive: true })
    await fsp.rename(oldAbs, newAbs)
  })

  ipcMain.handle('canvFS:delete', async (_e, rel) => {
    if (deps.isRemote()) {
      const ws = deps.getWorkspace()
      return ws.backend.delete(rel)
    }
    const root = deps.requireWorkspace()
    const abs = deps.safeResolve(root, rel)
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
    if (deps.isRemote()) {
      const ws = deps.getWorkspace()
      return ws.backend.search(query)
    }
    const root = deps.requireWorkspace()
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
        if (!deps.isAllowedDirEntry(ent.name)) continue
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
    const ws = deps.getWorkspace()
    const root = ws?.kind === 'local' ? ws.root : null
    if (!root) return null
    return workspaceConfig.readWorkspaceConfig(root)
  })

  ipcMain.handle('canvFS:writeWorkspaceConfig', async (_e, cfg) => {
    if (deps.isRemote()) throw new Error('Workspace config is local-only')
    const ws = deps.getWorkspace()
    const root = ws?.kind === 'local' ? ws.root : null
    if (!root) throw new Error('No workspace open')
    await workspaceConfig.writeWorkspaceConfig(root, cfg)
    return true
  })

  // ---------------------------------------------------------------------------
  // Git integration (isomorphic-git — pure JS, no system git required)
  // ---------------------------------------------------------------------------

  ipcMain.handle('canvFS:gitStatus', async () => {
    if (deps.isRemote()) {
      const ws = deps.getWorkspace()
      return ws.backend.gitStatus()
    }
    const root = deps.requireWorkspace()

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
    if (deps.isRemote()) {
      const ws = deps.getWorkspace()
      return ws.backend.gitDiff(rel, baseRef)
    }
    const root = deps.requireWorkspace()
    if (typeof rel !== 'string' || !rel) throw new Error('invalid rel')
    const ref = (typeof baseRef === 'string' && baseRef) ? baseRef : 'HEAD'

    // Read working-tree content (may be deleted).
    const abs = deps.safeResolve(root, rel)
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

  ipcMain.handle('canvFS:closeWorkspace', async () => {
    await deps.closeWorkspace()
    deps.onWorkspaceChangedGlobal()
  })

  ipcMain.handle('canvFS:listRecentRemotes', async () => {
    const rr = deps.getRecentRemotes()
    return rr ? rr.list() : []
  })

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
    await deps.closeWorkspace()
    const wsObj = { kind: 'remote', target: resolved, raw, pool, backend: rfs }
    deps.setWorkspace(wsObj)
    deps.setHistory(null)
    deps.onWorkspaceChangedGlobal()
    wsObj.unsub = rfs.subscribe((ev) => {
      const win = deps.getMainWindow()
      if (win && !win.isDestroyed()) win.webContents.send('canvFS:event', ev)
    })
    pool.on('disconnect', () => {
      const win = deps.getMainWindow()
      if (win && !win.isDestroyed()) win.webContents.send('canvFS:status', { kind: 'remote', state: 'offline' })
    })
    pool.on('connected', () => {
      const win = deps.getMainWindow()
      if (win && !win.isDestroyed()) win.webContents.send('canvFS:status', { kind: 'remote', state: 'online' })
    })
    const rr = deps.getRecentRemotes()
    if (rr) rr.record(raw)
    return { kind: 'remote', display: `${resolved.user || ''}@${resolved.host}:${resolved.path}`.replace(/^@/, '') }
  })

  ipcMain.handle('canvFS:getWorkspaceKind', async () => {
    const ws = deps.getWorkspace()
    if (!ws) return null
    if (ws.kind === 'local') return { kind: 'local', root: ws.root }
    return { kind: 'remote', display: `${ws.target.user || ''}@${ws.target.host}:${ws.target.path}`.replace(/^@/, '') }
  })

  ipcMain.handle('canvFS:reconnect', () => {
    const ws = deps.getWorkspace()
    if (ws?.kind === 'remote') ws.pool.reconnectNow()
  })
}

module.exports = { registerIpcHandlers, startWatcher, stopWatcher, getWatcher }
