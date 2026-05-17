'use strict'

const fsp = require('node:fs/promises')
const path = require('node:path')

class PersistentStorage {
  constructor(filePath) {
    this._file = filePath
    this._cache = null            // null = not yet loaded
    this._loading = null
  }

  async _load() {
    if (this._cache) return this._cache
    if (this._loading) return this._loading
    this._loading = (async () => {
      try {
        const text = await fsp.readFile(this._file, 'utf-8')
        this._cache = JSON.parse(text)
      } catch (e) {
        if (e.code === 'ENOENT') this._cache = {}
        else throw e
      }
      this._loading = null
      return this._cache
    })()
    return this._loading
  }

  async _flush() {
    await fsp.mkdir(path.dirname(this._file), { recursive: true })
    const tmp = this._file + '.tmp'
    await fsp.writeFile(tmp, JSON.stringify(this._cache, null, 2), 'utf-8')
    await fsp.rename(tmp, this._file)
  }

  async get(key)        { const c = await this._load(); return c[key] }
  async set(key, value) { const c = await this._load(); c[key] = value; await this._flush() }
  async delete(key)     { const c = await this._load(); delete c[key]; await this._flush() }
  async keys()          { const c = await this._load(); return Object.keys(c) }
}

module.exports = { PersistentStorage }
