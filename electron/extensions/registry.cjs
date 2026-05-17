'use strict'

const fs = require('node:fs')
const path = require('node:path')

const FILE_REL = path.join('.canv', 'extensions', 'registry.json')
const VERSION = 1

class Registry {
  constructor(workspaceRoot) {
    this._root = workspaceRoot
    this._file = path.join(workspaceRoot, FILE_REL)
    this._data = this._load()
  }

  _load() {
    try {
      const raw = fs.readFileSync(this._file, 'utf-8')
      const parsed = JSON.parse(raw)
      if (!parsed || parsed.version !== VERSION || !Array.isArray(parsed.extensions)) {
        return { version: VERSION, extensions: [] }
      }
      return parsed
    } catch {
      return { version: VERSION, extensions: [] }
    }
  }

  _save() {
    fs.mkdirSync(path.dirname(this._file), { recursive: true })
    const tmp = this._file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(this._data, null, 2), 'utf-8')
    fs.renameSync(tmp, this._file)
  }

  listEntries() { return this._data.extensions.slice() }

  get(id) {
    return this._data.extensions.find((e) => e.id === id) || null
  }

  install(manifest, hash) {
    const existing = this.get(manifest.id)
    const now = new Date().toISOString()
    if (existing && existing.manifestSha256 === hash) {
      existing.version = manifest.version
      this._save()
      return existing
    }
    const entry = {
      id: manifest.id,
      version: manifest.version,
      manifestSha256: hash,
      installedAt: existing ? existing.installedAt : now,
      enabled: false,
      trustedAt: null,
    }
    if (existing) {
      Object.assign(existing, entry)
    } else {
      this._data.extensions.push(entry)
    }
    this._save()
    return this.get(manifest.id)
  }

  uninstall(id) {
    this._data.extensions = this._data.extensions.filter((e) => e.id !== id)
    this._save()
  }

  setEnabled(id, enabled) {
    const e = this.get(id)
    if (!e) return
    e.enabled = Boolean(enabled)
    this._save()
  }

  setTrustedAt(id, isoOrNull) {
    const e = this.get(id)
    if (!e) return
    e.trustedAt = isoOrNull
    this._save()
  }
}

module.exports = { Registry, FILE_REL }
