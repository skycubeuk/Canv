'use strict'

const path = require('node:path')
const fsp = require('node:fs/promises')
const crypto = require('node:crypto')

const SKIP_DIR_NAMES = new Set(['log'])
const SKIP_FILE_NAMES = new Set(['settings.json'])

async function walk(root, relDir, out) {
  const abs = relDir ? path.join(root, relDir) : root
  const entries = await fsp.readdir(abs, { withFileTypes: true })
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const e of entries) {
    const rel = relDir ? `${relDir}/${e.name}` : e.name
    if (e.isDirectory()) {
      if (SKIP_DIR_NAMES.has(e.name)) continue
      await walk(root, rel, out)
    } else if (e.isFile()) {
      if (SKIP_FILE_NAMES.has(e.name)) continue
      out.push(rel)
    }
  }
}

async function hashExtensionDir(extensionDir) {
  const files = []
  await walk(extensionDir, '', files)
  const h = crypto.createHash('sha256')
  for (const rel of files) {
    h.update(rel)
    h.update('\0')
    const data = await fsp.readFile(path.join(extensionDir, rel))
    h.update(data)
    h.update('\0')
  }
  return h.digest('hex')
}

module.exports = { hashExtensionDir }
