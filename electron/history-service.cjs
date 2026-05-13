'use strict'
const fsp = require('node:fs/promises')
const nodefs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const git = require('isomorphic-git')

async function findParentGitDir(start) {
  let dir = path.resolve(start)
  while (true) {
    try {
      const s = await fsp.stat(path.join(dir, '.git'))
      if (s.isDirectory()) return dir
    } catch (e) { if (e.code !== 'ENOENT') throw e }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

const CANV_BRANCH = 'canv-history'
const CANV_AUTHOR = { name: 'Canv', email: 'noreply@canv.local' }

function nowIso() { return new Date().toISOString() }

function snapshotId() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
  const rand = crypto.randomBytes(3).toString('hex')
  return `snap_${stamp}_${rand}`
}

async function readJson(p) {
  try { return JSON.parse(await fsp.readFile(p, 'utf8')) }
  catch (e) { if (e.code === 'ENOENT') return null; throw e }
}

async function writeJsonAtomic(p, data) {
  const tmp = `${p}.tmp`
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8')
  await fsp.rename(tmp, p)
}

async function ensureGitignoreEntry(root, entry) {
  const giPath = path.join(root, '.gitignore')
  let txt = ''
  try { txt = await fsp.readFile(giPath, 'utf8') } catch (e) { if (e.code !== 'ENOENT') throw e }
  const lines = txt.split(/\r?\n/)
  if (!lines.includes(entry)) {
    const next = (txt === '' ? '' : (txt.endsWith('\n') ? txt : txt + '\n')) + entry + '\n'
    await fsp.writeFile(giPath, next, 'utf8')
  }
}

function createHistoryService({ root }) {
  const indexPath = path.join(root, '.canv', 'history-index.json')
  const mutex = (() => {
    let chain = Promise.resolve()
    return (fn) => { const next = chain.then(fn, fn); chain = next.catch(() => {}); return next }
  })()

  async function readIndex() {
    const data = await readJson(indexPath)
    if (data === null) return { schemaVersion: 1, latestSnapshot: null, snapshots: [] }
    if (data.schemaVersion !== 1) {
      throw new Error(`Unsupported history-index schemaVersion: ${data.schemaVersion}. This Canv version only supports schemaVersion 1.`)
    }
    return data
  }

  async function writeIndex(idx) {
    await fsp.mkdir(path.dirname(indexPath), { recursive: true })
    await writeJsonAtomic(indexPath, idx)
  }

  async function buildTreeFromDir(absRoot, rel) {
    const dir = path.join(absRoot, rel)
    const entries = await fsp.readdir(dir, { withFileTypes: true })
    const items = []
    for (const ent of entries) {
      if (ent.name === '.git' || ent.name === '.canv') continue
      const childRel = rel ? `${rel}/${ent.name}` : ent.name
      try {
        const ignored = await git.isIgnored({ fs: nodefs, dir: absRoot, filepath: childRel })
        if (ignored) continue
      } catch { /* on first init the repo isn't fully formed; treat as not-ignored */ }
      const abs = path.join(absRoot, childRel)
      if (ent.isDirectory()) {
        const sub = await buildTreeFromDir(absRoot, childRel)
        if (sub) items.push({ mode: '040000', path: ent.name, oid: sub, type: 'tree' })
      } else if (ent.isFile()) {
        const buf = await fsp.readFile(abs)
        const oid = await git.writeBlob({ fs: nodefs, dir: absRoot, blob: buf })
        items.push({ mode: '100644', path: ent.name, oid, type: 'blob' })
      }
      // Symlinks etc. skipped in v1
    }
    if (items.length === 0 && rel === '') {
      return await git.writeTree({ fs: nodefs, dir: absRoot, tree: [] })
    }
    if (items.length === 0) return null
    return await git.writeTree({ fs: nodefs, dir: absRoot, tree: items })
  }

  async function commitFullTree({ parent, message }) {
    const treeSha = await buildTreeFromDir(root, '')
    const ts = Math.floor(Date.now() / 1000)
    return await git.writeCommit({
      fs: nodefs, dir: root,
      commit: {
        message,
        tree: treeSha,
        parent: parent ? [parent] : [],
        author: { ...CANV_AUTHOR, timestamp: ts, timezoneOffset: 0 },
        committer: { ...CANV_AUTHOR, timestamp: ts, timezoneOffset: 0 },
      },
    })
  }

  async function initInner() {
    const existingGit = await findParentGitDir(root)
    if (existingGit && existingGit !== path.resolve(root)) {
      throw new Error(
        `Workspace is inside a parent git repository at "${existingGit}". ` +
        `Revision Archaeology does not yet support nested-workspace repos. ` +
        `Open the parent folder as a workspace, or move this folder out of the parent repo.`
      )
    }
    if (!existingGit) {
      await git.init({ fs: nodefs, dir: root, defaultBranch: 'main' })
    }
    await ensureGitignoreEntry(root, '.canv/')

    let tip = null
    try {
      tip = await git.resolveRef({ fs: nodefs, dir: root, ref: `refs/heads/${CANV_BRANCH}` })
    } catch { /* doesn't exist yet */ }

    let idx = await readIndex()

    if (!tip) {
      const sha = await commitFullTree({ parent: null, message: 'Canv: workspace init' })
      await git.writeRef({ fs: nodefs, dir: root, ref: `refs/heads/${CANV_BRANCH}`, value: sha, force: true })
      tip = sha
      if (idx.snapshots.length === 0) {
        const entry = {
          id: snapshotId(), commit: sha, createdAt: nowIso(),
          reason: 'workspace_init', summary: 'Workspace initialized',
          files: [], hidden: false, metadata: {},
        }
        idx = { schemaVersion: 1, latestSnapshot: entry.id, snapshots: [entry] }
        await writeIndex(idx)
      }
    } else if (idx.snapshots.length === 0) {
      // Branch exists but index missing — rebuild minimal index pointing at tip
      const entry = {
        id: snapshotId(), commit: tip, createdAt: nowIso(),
        reason: 'workspace_init', summary: 'Workspace initialized (index rebuilt)',
        files: [], hidden: false, metadata: {},
      }
      idx = { schemaVersion: 1, latestSnapshot: entry.id, snapshots: [entry] }
      await writeIndex(idx)
    }

    return { branch: CANV_BRANCH, headCommit: tip }
  }

  async function initRevisionArchaeology() {
    return mutex(initInner)
  }

  async function createSnapshotLocked({ reason, summary, files = [], metadata = {} }) {
    let parent
    try {
      parent = await git.resolveRef({ fs: nodefs, dir: root, ref: `refs/heads/${CANV_BRANCH}` })
    } catch {
      // Defensive: caller forgot to init. Run init inline (also mutex-guarded inside).
      // Note: we're already inside the mutex, so call the inner function directly to avoid deadlock.
      const init = await initInner()
      parent = init.headCommit
    }
    const sha = await commitFullTree({ parent, message: `Canv: ${reason} — ${summary}` })
    await git.writeRef({ fs: nodefs, dir: root, ref: `refs/heads/${CANV_BRANCH}`, value: sha, force: true })

    const idx = await readIndex()
    const entry = {
      id: snapshotId(), commit: sha, createdAt: nowIso(),
      reason, summary, files: [...files], hidden: false, metadata: { ...metadata },
    }
    idx.snapshots.push(entry)
    idx.latestSnapshot = entry.id
    await writeIndex(idx)
    return entry
  }

  async function createSnapshot(input) {
    return mutex(() => createSnapshotLocked(input))
  }

  async function listSnapshots({ includeHidden = false } = {}) {
    const idx = await readIndex()
    const arr = [...idx.snapshots].reverse()
    return includeHidden ? arr : arr.filter((s) => !s.hidden)
  }

  async function getSnapshot(id) {
    const idx = await readIndex()
    return idx.snapshots.find((s) => s.id === id) || null
  }

  async function getSnapshotByCommit(sha) {
    if (typeof sha !== 'string' || sha.length === 0) return null
    const idx = await readIndex()
    return idx.snapshots.find((s) => s.commit === sha) || null
  }

  async function hideSnapshot(id) {
    return mutex(async () => {
      const idx = await readIndex()
      const i = idx.snapshots.findIndex((s) => s.id === id)
      if (i < 0) throw new Error(`Unknown snapshot ${id}`)
      idx.snapshots[i] = { ...idx.snapshots[i], hidden: true }
      await writeIndex(idx)
      return idx.snapshots[i]
    })
  }

  async function readBlobAt(commit, relPath) {
    try {
      const { blob } = await git.readBlob({ fs: nodefs, dir: root, oid: commit, filepath: relPath })
      return Buffer.from(blob).toString('utf8')
    } catch (e) {
      if (e && e.code === 'NotFoundError') return ''
      throw e
    }
  }

  async function readWorking(relPath) {
    try { return await fsp.readFile(path.join(root, relPath), 'utf8') }
    catch (e) { if (e.code === 'ENOENT') return ''; throw e }
  }

  async function walkBlobsInTree(commit) {
    const out = new Map()
    async function recur(oid, prefix) {
      const { tree } = await git.readTree({ fs: nodefs, dir: root, oid })
      for (const ent of tree) {
        const p = prefix ? `${prefix}/${ent.path}` : ent.path
        if (ent.type === 'tree') await recur(ent.oid, p)
        else if (ent.type === 'blob') out.set(p, ent.oid)
      }
    }
    const { commit: c } = await git.readCommit({ fs: nodefs, dir: root, oid: commit })
    await recur(c.tree, '')
    return out
  }

  async function walkWorkingTree() {
    const out = new Set()
    async function recur(rel) {
      const dir = path.join(root, rel)
      const entries = await fsp.readdir(dir, { withFileTypes: true })
      for (const ent of entries) {
        if (ent.name === '.git' || ent.name === '.canv') continue
        const childRel = rel ? `${rel}/${ent.name}` : ent.name
        try {
          const ignored = await git.isIgnored({ fs: nodefs, dir: root, filepath: childRel })
          if (ignored) continue
        } catch { /* treat as not-ignored */ }
        if (ent.isDirectory()) await recur(childRel)
        else if (ent.isFile()) out.add(childRel)
      }
    }
    await recur('')
    return out
  }

  async function diffSnapshot(snapshotId, relPath) {
    const snap = await getSnapshot(snapshotId)
    if (!snap) throw new Error(`Unknown snapshot ${snapshotId}`)
    const tip = await git.resolveRef({ fs: nodefs, dir: root, ref: `refs/heads/${CANV_BRANCH}` })
    return { baseText: await readBlobAt(snap.commit, relPath), currentText: await readBlobAt(tip, relPath) }
  }

  async function getCurrentChanges() {
    const tip = await git.resolveRef({ fs: nodefs, dir: root, ref: `refs/heads/${CANV_BRANCH}` })
    const tipBlobs = await walkBlobsInTree(tip)
    const workingPaths = await walkWorkingTree()
    const changes = []

    for (const [relPath, oid] of tipBlobs) {
      if (!workingPaths.has(relPath)) { changes.push({ relPath, status: 'deleted' }); continue }
      const { blob } = await git.readBlob({ fs: nodefs, dir: root, oid })
      const workBuf = await fsp.readFile(path.join(root, relPath))
      if (Buffer.compare(Buffer.from(blob), workBuf) !== 0) changes.push({ relPath, status: 'modified' })
    }
    for (const relPath of workingPaths) {
      if (!tipBlobs.has(relPath)) changes.push({ relPath, status: 'added' })
    }
    changes.sort((a, b) => a.relPath.localeCompare(b.relPath))
    return changes
  }

  async function diffCurrent(relPath) {
    if (relPath) {
      const tip = await git.resolveRef({ fs: nodefs, dir: root, ref: `refs/heads/${CANV_BRANCH}` })
      return { baseText: await readBlobAt(tip, relPath), currentText: await readWorking(relPath) }
    }
    return await getCurrentChanges()
  }

  async function restoreFilePreview(snapshotId, relPath) {
    const snap = await getSnapshot(snapshotId)
    if (!snap) throw new Error(`Unknown snapshot ${snapshotId}`)
    const snapshotText = await readBlobAt(snap.commit, relPath)
    const currentText = await readWorking(relPath)
    return { snapshotText, currentText }
  }

  async function restoreFile(snapshotId, relPath) {
    return mutex(async () => {
      const idx0 = await readIndex()
      const snap = idx0.snapshots.find((s) => s.id === snapshotId)
      if (!snap) throw new Error(`Unknown snapshot ${snapshotId}`)
      const rollback = await createSnapshotLocked({
        reason: 'before_rollback',
        summary: `Before restore of ${relPath} from ${snap.id}`,
        files: [relPath],
        metadata: { snapshotId: snap.id },
      })
      const text = await readBlobAt(snap.commit, relPath)
      const abs = path.join(root, relPath)
      await fsp.mkdir(path.dirname(abs), { recursive: true })
      await fsp.writeFile(abs, text, 'utf8')
      return { rollbackSnapshotId: rollback.id }
    })
  }

  async function patchSnapshotFiles(id, files) {
    return mutex(async () => {
      const idx = await readIndex()
      const i = idx.snapshots.findIndex((s) => s.id === id)
      if (i < 0) throw new Error(`Unknown snapshot ${id}`)
      idx.snapshots[i] = { ...idx.snapshots[i], files: [...files] }
      await writeIndex(idx)
    })
  }

  async function getTipCommit() {
    try {
      return await git.resolveRef({ fs: nodefs, dir: root, ref: `refs/heads/${CANV_BRANCH}` })
    } catch { return null }
  }

  async function readBlobOidAt(commit, relPath) {
    // Returns the blob OID for `relPath` at `commit`, or null if absent.
    try {
      const { commit: c } = await git.readCommit({ fs: nodefs, dir: root, oid: commit })
      const parts = relPath.split('/')
      let treeOid = c.tree
      for (let i = 0; i < parts.length - 1; i++) {
        const { tree } = await git.readTree({ fs: nodefs, dir: root, oid: treeOid })
        const ent = tree.find((e) => e.path === parts[i] && e.type === 'tree')
        if (!ent) return null
        treeOid = ent.oid
      }
      const { tree } = await git.readTree({ fs: nodefs, dir: root, oid: treeOid })
      const leaf = tree.find((e) => e.path === parts[parts.length - 1] && e.type === 'blob')
      return leaf ? leaf.oid : null
    } catch (e) {
      if (e && e.code === 'NotFoundError') return null
      throw e
    }
  }

  async function getFileHistory(relPath) {
    const idx = await readIndex()
    if (!idx.snapshots.length) return []
    const byCommit = new Map(idx.snapshots.map((s) => [s.commit, s]))

    let tip
    try {
      tip = await git.resolveRef({ fs: nodefs, dir: root, ref: `refs/heads/${CANV_BRANCH}` })
    } catch { return [] }

    // Collect the full commit chain newest→oldest, then reverse to oldest→newest
    const chain = []
    let cur = tip
    while (cur) {
      chain.push(cur)
      const { commit: c } = await git.readCommit({ fs: nodefs, dir: root, oid: cur })
      cur = c.parent && c.parent[0] ? c.parent[0] : null
    }
    chain.reverse() // now oldest→newest

    // Resolve blob OID for every commit in the chain
    const oids = await Promise.all(chain.map((sha) => readBlobOidAt(sha, relPath)))

    // Walk oldest→newest: emit visible (non-hidden) snapshots where the file blob is
    // distinct from the previously-seen blob (including hidden/init blobs for dedup).
    // workspace_init (reason === 'workspace_init') is never emitted.
    // First visible snapshot that has the file is always emitted.
    const out = []
    let prevOid = null
    for (let i = 0; i < chain.length; i++) {
      const curOid = oids[i]
      if (curOid === null) continue // file absent at this commit — skip in v1
      const snap = byCommit.get(chain[i])
      if (snap && !snap.hidden && snap.reason !== 'workspace_init') {
        // Emit if this is the first occurrence or the blob changed since last seen
        if (curOid !== prevOid) {
          out.push({
            snapshotId: snap.id,
            commit: snap.commit,
            createdAt: snap.createdAt,
            reason: snap.reason,
            summary: snap.summary,
          })
        }
      }
      // Track for dedup (non-absent blobs, excluding workspace_init baseline)
      const snapHere = byCommit.get(chain[i])
      if (!snapHere || snapHere.reason !== 'workspace_init') prevOid = curOid
    }
    out.reverse() // return newest→oldest
    return out
  }

  async function getSnapshotDelta(snapshotIdArg) {
    const snap = await getSnapshot(snapshotIdArg)
    if (!snap) throw new Error(`Unknown snapshot ${snapshotIdArg}`)
    const snapBlobs = await walkBlobsInTree(snap.commit)
    const workingPaths = await walkWorkingTree()
    const changes = []

    for (const [relPath, oid] of snapBlobs) {
      if (!workingPaths.has(relPath)) {
        // exists in snapshot, missing on disk → file was deleted since the snapshot
        changes.push({ relPath, status: 'deleted' })
        continue
      }
      const { blob } = await git.readBlob({ fs: nodefs, dir: root, oid })
      const workBuf = await fsp.readFile(path.join(root, relPath))
      if (Buffer.compare(Buffer.from(blob), workBuf) !== 0) {
        changes.push({ relPath, status: 'modified' })
      }
    }
    for (const relPath of workingPaths) {
      if (!snapBlobs.has(relPath)) {
        // exists on disk, missing from snapshot → file was added since the snapshot
        changes.push({ relPath, status: 'added' })
      }
    }
    changes.sort((a, b) => a.relPath.localeCompare(b.relPath))
    return changes
  }

  return { initRevisionArchaeology, createSnapshot, listSnapshots, getSnapshot, getSnapshotByCommit,
           hideSnapshot, diffSnapshot, diffCurrent, getCurrentChanges, restoreFilePreview, restoreFile,
           patchSnapshotFiles, getTipCommit, getSnapshotDelta, getFileHistory }
}

module.exports = { createHistoryService }
