const path = require('node:path/posix')
const { randomBytes } = require('node:crypto')
const { createParser } = require('./inotify-parser.cjs')

const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', '.DS_Store'])
const PUBLIC_EXTS = new Set(['.md', '.markdown'])
const INTERNAL_EXTS = new Set(['.json'])
const MAX_READ_BYTES = 2 * 1024 * 1024
const MAX_LIST_ENTRIES = 5000
const MAX_DEPTH = 8
const SEARCH_MAX_MATCHES = 1000
const SEARCH_SNIPPET_LIMIT = 240

function shellEscape(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`
}

function trimSnippet(line, col, matchLen) {
  if (line.length <= SEARCH_SNIPPET_LIMIT) return { snippet: line, snippetCol: col }
  const start = Math.max(0, col - 40)
  const end = col + matchLen + 40
  return { snippet: line.slice(start, end), snippetCol: col - start }
}

function parseRgJson(stdout, root, folderPrefix) {
  const matches = []
  let truncated = false
  for (const line of stdout.split('\n')) {
    if (!line) continue
    let obj
    try { obj = JSON.parse(line) } catch { continue }
    if (obj.type !== 'match') continue
    const absPath = obj.data.path.text
    const rel = absPath.startsWith(root + '/') ? absPath.slice(root.length + 1) : absPath
    if (folderPrefix && !rel.startsWith(folderPrefix)) continue
    const lineNumber = (obj.data.line_number || 1) - 1
    const text = String(obj.data.lines.text || '').replace(/\n$/, '')
    for (const sm of obj.data.submatches || []) {
      if (matches.length >= SEARCH_MAX_MATCHES) { truncated = true; break }
      const col = sm.start
      const matchLen = sm.end - sm.start
      const { snippet, snippetCol } = trimSnippet(text, col, matchLen)
      matches.push({ rel, line: lineNumber, col, matchLen, snippet, snippetCol })
    }
    if (truncated) break
  }
  return { matches, truncated }
}

function parseGrepOutput(stdout, root, folderPrefix, queryStr, query) {
  const matches = []
  let truncated = false
  for (const line of stdout.split('\n')) {
    if (!line) continue
    const m = line.match(/^([^:]+):(\d+):(.*)$/)
    if (!m) continue
    const absPath = m[1]
    const lineNum = Number(m[2]) - 1
    const text = m[3]
    const rel = absPath.startsWith(root + '/') ? absPath.slice(root.length + 1) : absPath
    if (folderPrefix && !rel.startsWith(folderPrefix)) continue
    // Re-scan the line in JS to find col + matchLen (grep -n doesn't give them).
    let pattern
    try {
      const flags = query.caseSensitive ? 'g' : 'gi'
      pattern = query.regex
        ? new RegExp(queryStr, flags)
        : new RegExp(queryStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags)
    } catch { continue }
    let mm
    while ((mm = pattern.exec(text)) !== null) {
      if (mm[0].length === 0) { pattern.lastIndex = mm.index + 1; continue }
      if (matches.length >= SEARCH_MAX_MATCHES) { truncated = true; break }
      const col = mm.index
      const matchLen = mm[0].length
      const { snippet, snippetCol } = trimSnippet(text, col, matchLen)
      matches.push({ rel, line: lineNum, col, matchLen, snippet, snippetCol })
    }
    if (truncated) break
  }
  return { matches, truncated }
}

function parseGitStatus(stdout) {
  // --porcelain=v2 -z: records are NUL-terminated (NUL also used as field separator
  // within renamed entries). Header lines start with '#', changed entries with '1'/'2',
  // untracked with '?'. Split on NUL and filter empties.
  const recs = stdout.split('\0').filter(Boolean)
  const out = { branch: null, changed: [], staged: [], untracked: [] }
  for (const rec of recs) {
    if (rec.startsWith('# branch.head ')) {
      out.branch = rec.slice('# branch.head '.length)
      if (out.branch === '(detached)') out.branch = null
      continue
    }
    if (rec.startsWith('? ')) {
      out.untracked.push({ relPath: rec.slice(2), status: 'untracked' })
      continue
    }
    if (rec.startsWith('1 ')) {
      // Format: "1 XY ..sub mH mI mW hH hI path"
      const parts = rec.split(' ')
      const xy = parts[1]
      const filepath = parts.slice(8).join(' ')
      addStatus(out, xy, filepath)
      continue
    }
    if (rec.startsWith('2 ')) {
      // Renamed/copied: "2 XY ..sub mH mI mW hH hI Rscore path"
      const parts = rec.split(' ')
      const xy = parts[1]
      // path is parts[9] possibly with spaces, but renamed entries have a tab-separated
      // 'newpath\toldpath'; we want the new (current) path only.
      const tail = parts.slice(9).join(' ')
      const filepath = tail.split('\t')[0]
      addStatus(out, xy, filepath, /*renamed=*/ true)
      continue
    }
  }
  out.changed.sort((a, b) => a.relPath.localeCompare(b.relPath))
  out.staged.sort((a, b) => a.relPath.localeCompare(b.relPath))
  out.untracked.sort((a, b) => a.relPath.localeCompare(b.relPath))
  return out
}

function addStatus(out, xy, relPath, renamed = false) {
  // xy: index status (X), worktree status (Y). '.' = unmodified.
  const X = xy[0], Y = xy[1]
  // Worktree (changed) side
  if (Y === 'M') out.changed.push({ relPath, status: 'modified' })
  else if (Y === 'D') out.changed.push({ relPath, status: 'deleted' })
  else if (Y === 'R') out.changed.push({ relPath, status: 'renamed' })
  // Index (staged) side
  if (X === 'A') out.staged.push({ relPath, status: 'added' })
  else if (X === 'M') out.staged.push({ relPath, status: 'modified' })
  else if (X === 'D') out.staged.push({ relPath, status: 'deleted' })
  else if (X === 'R') out.staged.push({ relPath, status: 'renamed' })
}

function safeResolve(root, rel) {
  if (typeof rel !== 'string') throw new Error('invalid path')
  if (rel.includes('\0')) throw new Error('invalid path')
  if (rel.startsWith('/') || rel.startsWith('\\')) throw new Error('absolute paths not allowed')
  const normalized = rel.replace(/\\/g, '/').replace(/^\.\/+/, '')
  if (normalized.split('/').some((s) => s === '..')) throw new Error('parent traversal not allowed')
  const abs = path.resolve(root, normalized)
  if (abs !== root && !abs.startsWith(root + '/')) throw new Error('path escape')
  return abs
}

function isInternal(rel) { return rel === '.canv' || rel.startsWith('.canv/') }
function isAllowedExt(rel, abs) {
  const ext = path.extname(abs).toLowerCase()
  if (isInternal(rel)) return INTERNAL_EXTS.has(ext)
  return PUBLIC_EXTS.has(ext)
}
function isAllowedDirEntry(name) { return !SKIP_DIRS.has(name) && !name.startsWith('.') }

function pProm(sftp, method, ...args) {
  return new Promise((res, rej) => sftp[method](...args, (err, val) => err ? rej(err) : res(val)))
}

class RemoteFs {
  constructor({ pool, rootPath, preflight = {} }) {
    this.pool = pool
    this.root = rootPath.replace(/\/$/, '')
    this.preflight = preflight
  }

  async readFile(rel) {
    const abs = safeResolve(this.root, rel)
    const sftp = await this.pool.getSftp()
    const stat = await pProm(sftp, 'stat', abs)
    if (stat.size > MAX_READ_BYTES) throw new Error('file too large')
    if (!isAllowedExt(rel, abs)) throw new Error('binary or unsupported file type')
    const buf = await new Promise((res, rej) => {
      const chunks = []
      const stream = sftp.createReadStream(abs)
      stream.on('data', (c) => chunks.push(c))
      stream.on('end', () => res(Buffer.concat(chunks)))
      stream.on('error', (e) => { rej(e); stream.destroy() })
    })
    return { content: buf.toString('utf8'), mtimeMs: (stat.mtime || 0) * 1000 }
  }

  async writeFile(rel, content, expectedMtimeMs) {
    const abs = safeResolve(this.root, rel)
    const sftp = await this.pool.getSftp()
    if (typeof expectedMtimeMs === 'number') {
      const cur = await pProm(sftp, 'stat', abs).catch(() => null)
      if (cur && cur.mtime * 1000 !== expectedMtimeMs) {
        const e = new Error('stale write: file changed on disk')
        e.code = 'STALE_WRITE'
        throw e
      }
    }
    const tmp = `${abs}.canv-tmp-${randomBytes(6).toString('hex')}`
    await new Promise((res, rej) => {
      const ws = sftp.createWriteStream(tmp)
      ws.on('error', (e) => { rej(e); ws.destroy() })
      ws.on('close', res)
      ws.end(Buffer.from(content, 'utf8'))
    })
    await pProm(sftp, 'rename', tmp, abs)
    const stat = await pProm(sftp, 'stat', abs)
    return { mtimeMs: (stat.mtime || 0) * 1000 }
  }

  async createFile(rel, content = '') {
    const abs = safeResolve(this.root, rel)
    const sftp = await this.pool.getSftp()
    await new Promise((res, rej) => {
      const ws = sftp.createWriteStream(abs, { flags: 'wx' })
      ws.on('error', (e) => { rej(e); ws.destroy() })
      ws.on('close', res)
      ws.end(Buffer.from(content, 'utf8'))
    })
    const stat = await pProm(sftp, 'stat', abs)
    return { mtimeMs: (stat.mtime || 0) * 1000 }
  }

  async createFolder(rel) {
    const abs = safeResolve(this.root, rel)
    const sftp = await this.pool.getSftp()
    await pProm(sftp, 'mkdir', abs)
  }

  async rename(oldRel, newRel) {
    const a = safeResolve(this.root, oldRel)
    const b = safeResolve(this.root, newRel)
    const sftp = await this.pool.getSftp()
    await pProm(sftp, 'rename', a, b)
  }

  async delete(rel) {
    const abs = safeResolve(this.root, rel)
    const sftp = await this.pool.getSftp()
    const stat = await pProm(sftp, 'stat', abs)
    if (stat.isDirectory && stat.isDirectory()) {
      await this._removeDir(sftp, abs)
    } else {
      await pProm(sftp, 'unlink', abs)
    }
  }

  async _removeDir(sftp, abs) {
    const entries = await pProm(sftp, 'readdir', abs)
    for (const e of entries) {
      const child = `${abs}/${e.filename}`
      const isDir = (e.attrs.mode & 0o170000) === 0o040000
      if (isDir) await this._removeDir(sftp, child)
      else await pProm(sftp, 'unlink', child)
    }
    await pProm(sftp, 'rmdir', abs)
  }

  async listDir(rel = '') {
    const root = this.root
    const start = rel ? safeResolve(root, rel) : root
    return this._buildTree(await this.pool.getSftp(), root, start, rel || '', 0)
  }

  async search(query) {
    const q = String(query?.query || '')
    if (!q) return { matches: [], truncated: false }
    const root = shellEscape(this.root)
    const folder = typeof query.folder === 'string' ? query.folder.replace(/^\/+|\/+$/g, '') : ''
    const useRg = this.preflight?.hasRg !== false
    let cmd
    if (useRg) {
      const flags = ['--json', '--type', 'md', '--no-config']
      if (!query.caseSensitive) flags.push('-i')
      if (!query.regex) flags.push('-F')
      flags.push('-e', shellEscape(q), root)
      cmd = ['rg', ...flags].join(' ')
    } else {
      const flags = ['-rn', '--include=*.md', '--include=*.markdown', '--binary-files=without-match', '--exclude-dir=.git', '--exclude-dir=node_modules']
      if (!query.caseSensitive) flags.push('-i')
      flags.push(query.regex ? '-E' : '-F')
      flags.push('-e', shellEscape(q), root)
      cmd = ['grep', ...flags].join(' ')
    }
    const { stdout, code } = await this.pool.exec(cmd)
    if (code !== 0 && code !== 1) return { matches: [], truncated: false }
    return useRg
      ? parseRgJson(stdout, this.root, folder)
      : parseGrepOutput(stdout, this.root, folder, q, query)
  }

  async gitStatus() {
    const r = await this.pool.exec(`git -C ${shellEscape(this.root)} status --porcelain=v2 --branch -z`)
    if (r.code !== 0) {
      if (/not a git repository/i.test(r.stderr)) {
        return { branch: null, changed: [], staged: [], untracked: [], noRepo: true }
      }
      return { branch: null, changed: [], staged: [], untracked: [] }
    }
    return parseGitStatus(r.stdout)
  }

  async gitDiff(rel, baseRef) {
    // Validate rel via safeResolve to block path traversal even though we're
    // shelling out to git, not touching the filesystem directly.
    safeResolve(this.root, rel)
    const ref = (typeof baseRef === 'string' && baseRef) ? baseRef : 'HEAD'
    const showCmd = `git -C ${shellEscape(this.root)} show ${shellEscape(`${ref}:${rel}`)}`
    const r = await this.pool.exec(showCmd)
    let baseText = ''
    if (r.code === 0) baseText = r.stdout
    let currentText = ''
    try {
      const cur = await this.readFile(rel)
      currentText = cur.content
    } catch { /* file may be deleted */ }
    return { relPath: rel, baseRef: ref, baseText, currentText }
  }

  async _buildTree(sftp, root, abs, relDir, depth) {
    const entries = await pProm(sftp, 'readdir', abs).catch(() => [])
    entries.sort((a, b) => {
      const da = (a.attrs.mode & 0o170000) === 0o040000 ? 0 : 1
      const db = (b.attrs.mode & 0o170000) === 0o040000 ? 0 : 1
      if (da !== db) return da - db
      return a.filename.localeCompare(b.filename)
    })
    const children = []; let count = 0; let truncated = false
    for (const ent of entries) {
      if (count >= MAX_LIST_ENTRIES) { truncated = true; break }
      if (!isAllowedDirEntry(ent.filename)) continue
      const childRel = relDir ? `${relDir}/${ent.filename}` : ent.filename
      const childAbs = `${abs}/${ent.filename}`
      const isDir = (ent.attrs.mode & 0o170000) === 0o040000
      if (isDir) {
        if (depth >= MAX_DEPTH) {
          children.push({ name: ent.filename, relPath: childRel, kind: 'dir', children: [], truncated: true })
        } else {
          children.push(await this._buildTree(sftp, root, childAbs, childRel, depth + 1))
        }
        count++
      } else {
        const allowed = isAllowedExt(childRel, childAbs)
        children.push({
          name: ent.filename,
          relPath: childRel,
          kind: 'file',
          mtimeMs: (ent.attrs.mtime || 0) * 1000,
          size: ent.attrs.size || 0,
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
  subscribe(cb) {
    let stopped = false
    let stream = null
    const parser = createParser({ root: this.root })
    parser.onEvent(cb)
    const start = async () => {
      if (stopped) return
      const root = this.root.replace(/'/g, `'\\''`)
      try {
        stream = await this.pool.spawn(
          `inotifywait -mr -q --format '%e %w%f' --exclude '(\\.git/|node_modules/)' '${root}'`
        )
      } catch {
        if (!stopped) setTimeout(start, 1000)
        return
      }
      stream.on('data', (d) => parser.feed(d.toString('utf8')))
      stream.on('close', () => {
        parser.flush()
        if (!stopped) setTimeout(start, 1000)
      })
    }
    start()
    return () => {
      stopped = true
      try { stream && stream.close && stream.close() } catch { /* ignore */ }
    }
  }
}

module.exports = { RemoteFs, safeResolve }
