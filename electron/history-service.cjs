'use strict'
const fsp = require('node:fs/promises')
const nodefs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const git = require('isomorphic-git')

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

  async function gitDirExists() {
    try { const s = await fsp.stat(path.join(root, '.git')); return s.isDirectory() } catch { return false }
  }

  async function readIndex() {
    return (await readJson(indexPath)) || { schemaVersion: 1, latestSnapshot: null, snapshots: [] }
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
    if (!(await gitDirExists())) {
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

  return { initRevisionArchaeology }
}

module.exports = { createHistoryService }
