'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const SESSION_FILE = 'session.json'
const PRESERVE_NAMES = new Set([SESSION_FILE, 'log'])

function createSession(baseDir, opts = {}) {
  const id = crypto.randomUUID()
  const dir = path.join(baseDir, id)
  fs.mkdirSync(dir, { recursive: true })
  const now = new Date().toISOString()
  const sj = {
    id,
    createdAt: now,
    updatedAt: now,
    builderPrompt: '',
    editingExtensionId: opts.editingExtensionId ?? null,
    history: [],
  }
  fs.writeFileSync(path.join(dir, SESSION_FILE), JSON.stringify(sj, null, 2), 'utf-8')
  return { id, dir }
}

function loadSession(baseDir, id) {
  const dir = path.join(baseDir, id)
  const file = path.join(dir, SESSION_FILE)
  try {
    const sj = JSON.parse(fs.readFileSync(file, 'utf-8'))
    const manifestPath = path.join(dir, 'manifest.json')
    let manifest
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) } catch { /* no manifest yet */ }
    return {
      id: sj.id,
      history: sj.history || [],
      builderPrompt: sj.builderPrompt || '',
      editingExtensionId: sj.editingExtensionId ?? null,
      manifest,
    }
  } catch { return null }
}

function listSessions(baseDir) {
  let entries
  try { entries = fs.readdirSync(baseDir, { withFileTypes: true }) } catch { return [] }
  const out = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const sjPath = path.join(baseDir, e.name, SESSION_FILE)
    try {
      const sj = JSON.parse(fs.readFileSync(sjPath, 'utf-8'))
      const stat = fs.statSync(sjPath)
      out.push({
        id: sj.id, createdAt: sj.createdAt, updatedAt: sj.updatedAt,
        builderPrompt: sj.builderPrompt || '',
        _mtime: stat.mtimeMs,
      })
    } catch { /* skip malformed */ }
  }
  out.sort((a, b) => b._mtime - a._mtime)
  return out.map(({ _mtime, ...rest }) => rest)
}

function clearStaleFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    if (PRESERVE_NAMES.has(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) fs.rmSync(p, { recursive: true, force: true })
    else fs.unlinkSync(p)
  }
}

function writeIteration(sessionDir, payload) {
  clearStaleFiles(sessionDir)
  fs.writeFileSync(path.join(sessionDir, 'manifest.json'), JSON.stringify(payload.manifest, null, 2), 'utf-8')
  for (const [relPath, content] of Object.entries(payload.files || {})) {
    if (relPath.includes('..')) throw new Error(`unsafe relative path: ${relPath}`)
    const abs = path.join(sessionDir, relPath)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content, 'utf-8')
  }
}

function appendHistory(sessionDir, message) {
  const file = path.join(sessionDir, SESSION_FILE)
  const sj = JSON.parse(fs.readFileSync(file, 'utf-8'))
  sj.history = sj.history || []
  sj.history.push(message)
  sj.updatedAt = new Date().toISOString()
  fs.writeFileSync(file, JSON.stringify(sj, null, 2), 'utf-8')
}

function deleteSession(baseDir, id) {
  const dir = path.join(baseDir, id)
  fs.rmSync(dir, { recursive: true, force: true })
}

function pruneOldSessions(baseDir, keepN) {
  const list = listSessions(baseDir)
  const toDelete = list.slice(keepN)
  for (const s of toDelete) deleteSession(baseDir, s.id)
}

module.exports = {
  createSession, listSessions, loadSession,
  writeIteration, appendHistory, deleteSession, pruneOldSessions,
}
