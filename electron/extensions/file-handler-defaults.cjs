'use strict'
const fs = require('node:fs')
const path = require('node:path')

const SUBDIR = path.join('.canv', 'extensions')
const FILENAME = 'file-handlers.json'

function filePathFor(workspaceRoot) {
  return path.join(workspaceRoot, SUBDIR, FILENAME)
}

function readDefaults(workspaceRoot) {
  try {
    const raw = fs.readFileSync(filePathFor(workspaceRoot), 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && parsed.defaults && typeof parsed.defaults === 'object') {
      const out = {}
      for (const [k, v] of Object.entries(parsed.defaults)) {
        if (typeof k === 'string' && typeof v === 'string') out[k] = v
      }
      return out
    }
    return {}
  } catch {
    return {}
  }
}

function writeDefault(workspaceRoot, ext, extensionIdOrNull) {
  const current = readDefaults(workspaceRoot)
  if (extensionIdOrNull == null) delete current[ext]
  else current[ext] = extensionIdOrNull
  const dir = path.dirname(filePathFor(workspaceRoot))
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(filePathFor(workspaceRoot), JSON.stringify({ version: 1, defaults: current }, null, 2))
}

module.exports = { readDefaults, writeDefault }
