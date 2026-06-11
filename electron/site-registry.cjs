'use strict'

const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const yaml = require('yaml')

const REGISTRY_REL = path.join('.canv', 'site_index.yaml')
const SITES_PREFIX = '.canv/sites/'
const REQUIRED_FIELDS = ['name', 'folder', 'entry', 'prompt', 'source_files']

function registryPath(workspaceRoot) {
  return path.join(workspaceRoot, REGISTRY_REL)
}

function readAll(workspaceRoot) {
  const p = registryPath(workspaceRoot)
  if (!fs.existsSync(p)) return { sites: [] }
  const raw = fs.readFileSync(p, 'utf8')
  let parsed
  try { parsed = yaml.parse(raw) }
  catch (err) { throw new Error(`Failed to parse ${REGISTRY_REL}: ${err.message}`, { cause: err }) }
  if (!parsed || typeof parsed !== 'object') return { sites: [] }
  if (!Array.isArray(parsed.sites)) parsed.sites = []
  return parsed
}

function writeAll(workspaceRoot, data) {
  const p = registryPath(workspaceRoot)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  const tmp = p + '.tmp'
  fs.writeFileSync(tmp, yaml.stringify(data), 'utf8')
  fs.renameSync(tmp, p)
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'site'
}

function randomSuffix() {
  return crypto.randomBytes(2).toString('hex')
}

function normalizeFolder(folder) {
  if (typeof folder !== 'string') return null
  const norm = folder.replace(/\\/g, '/').replace(/^\.\//, '')
  if (norm.split('/').includes('..')) return null
  if (!norm.startsWith(SITES_PREFIX) || norm === SITES_PREFIX) return null
  return norm
}

function nowIso() { return new Date().toISOString() }

function validateInput(input) {
  if (!input || typeof input !== 'object') throw new Error('input is required')
  for (const f of REQUIRED_FIELDS) {
    if (input[f] === undefined || input[f] === null) {
      throw new Error(`Field "${f}" is required`)
    }
  }
  if (!Array.isArray(input.source_files)) {
    throw new Error('Field "source_files" must be an array of glob strings')
  }
  const folder = normalizeFolder(input.folder)
  if (!folder) throw new Error('Field "folder" must be under .canv/sites/<id>/')
  return folder
}

function register(workspaceRoot, input) {
  const folder = validateInput(input)
  const data = readAll(workspaceRoot)
  const taken = new Set(data.sites.map((s) => s.id))
  const slug = slugify(input.name)
  let id = null
  for (let i = 0; i < 16; i++) {
    const candidate = `${slug}-${randomSuffix()}`
    if (!taken.has(candidate)) { id = candidate; break }
  }
  if (!id) throw new Error('Could not allocate a unique site id after 16 attempts')

  // Always store folders as .canv/sites/<id>/ so the URL id and the on-disk
  // folder are identical. If the agent wrote to a different folder, rename
  // it to match. This keeps the contract simple for follow-up updates: the
  // agent only needs to know its id to find its files.
  const canonicalFolder = `${SITES_PREFIX}${id}`
  const sourceAbs = path.resolve(workspaceRoot, folder)
  const targetAbs = path.resolve(workspaceRoot, canonicalFolder)
  if (sourceAbs !== targetAbs) {
    if (fs.existsSync(targetAbs)) {
      throw new Error(`Cannot rename ${folder} to ${canonicalFolder}: target already exists`)
    }
    if (fs.existsSync(sourceAbs)) {
      fs.renameSync(sourceAbs, targetAbs)
    }
  }

  const ts = nowIso()
  const entry = {
    id,
    name: String(input.name),
    description: input.description ? String(input.description) : '',
    folder: canonicalFolder,
    entry: String(input.entry),
    created: ts,
    updated: ts,
    prompt: String(input.prompt),
    source_files: input.source_files.map((s) => String(s)),
    pinned: Boolean(input.pinned),
  }
  data.sites.push(entry)
  writeAll(workspaceRoot, data)
  return entry
}

function update(workspaceRoot, id, patch) {
  if (!patch || typeof patch !== 'object') throw new Error('patch must be an object')
  if ('id' in patch) throw new Error('Cannot change id')
  if ('created' in patch) throw new Error('Cannot change created')
  let folder
  if (patch.folder !== undefined) {
    folder = normalizeFolder(patch.folder)
    if (!folder) throw new Error('Field "folder" must be under .canv/sites/<id>/')
  }
  let sourceFiles
  if (patch.source_files !== undefined) {
    if (!Array.isArray(patch.source_files)) {
      throw new Error('Field "source_files" must be an array of glob strings')
    }
    sourceFiles = patch.source_files.map((s) => String(s))
  }
  const data = readAll(workspaceRoot)
  const idx = data.sites.findIndex((s) => s.id === id)
  if (idx < 0) throw new Error(`Unknown site id: ${id}`)
  const merged = { ...data.sites[idx], ...patch, updated: nowIso() }
  if (folder !== undefined) merged.folder = folder
  if (sourceFiles !== undefined) merged.source_files = sourceFiles
  data.sites[idx] = merged
  writeAll(workspaceRoot, data)
  return merged
}

function unregister(workspaceRoot, id) {
  const data = readAll(workspaceRoot)
  const next = data.sites.filter((s) => s.id !== id)
  if (next.length === data.sites.length) return
  writeAll(workspaceRoot, { ...data, sites: next })
}

function list(workspaceRoot) {
  return readAll(workspaceRoot).sites.slice()
}

function get(workspaceRoot, id) {
  const found = readAll(workspaceRoot).sites.find((s) => s.id === id)
  return found || null
}

module.exports = { register, update, unregister, list, get, _internal: { slugify, normalizeFolder } }
