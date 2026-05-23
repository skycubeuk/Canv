'use strict'

const fs = require('node:fs')
const path = require('node:path')

const VERSION = 1
const VALID_STATES = new Set(['trusted', 'untrusted', 'always-disabled'])

class WorkspaceTrustStore {
  constructor(filePath) {
    this._file = filePath
    this._data = this._load()
  }

  _load() {
    try {
      const raw = fs.readFileSync(this._file, 'utf-8')
      const parsed = JSON.parse(raw)
      if (!parsed || parsed.version !== VERSION || typeof parsed.workspaces !== 'object') {
        return { version: VERSION, workspaces: {} }
      }
      return parsed
    } catch {
      return { version: VERSION, workspaces: {} }
    }
  }

  _save() {
    fs.mkdirSync(path.dirname(this._file), { recursive: true })
    const tmp = this._file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(this._data, null, 2), 'utf-8')
    fs.renameSync(tmp, this._file)
  }

  stateFor(workspacePath) {
    const e = this._data.workspaces[workspacePath]
    return e ? e.state : 'untrusted'
  }

  set(workspacePath, state) {
    if (!VALID_STATES.has(state)) {
      throw new Error(`invalid trust state: ${state}`)
    }
    this._data.workspaces[workspacePath] = { state, updatedAt: new Date().toISOString() }
    this._save()
  }

  forget(workspacePath) {
    delete this._data.workspaces[workspacePath]
    this._save()
  }
}

module.exports = { WorkspaceTrustStore }
