'use strict'
const fsp = require('node:fs/promises')
const path = require('node:path')

function configPath(root) {
  return path.join(root, '.canv', 'workspace.json')
}

async function readWorkspaceConfig(root) {
  try {
    const raw = await fsp.readFile(configPath(root), 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.schemaVersion !== 1) return null
    return parsed
  } catch (e) {
    if (e && e.code === 'ENOENT') return null
    if (e instanceof SyntaxError) return null
    throw e
  }
}

async function writeWorkspaceConfig(root, cfg) {
  const dir = path.join(root, '.canv')
  await fsp.mkdir(dir, { recursive: true })
  const target = configPath(root)
  const tmp = `${target}.tmp`
  await fsp.writeFile(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8')
  await fsp.rename(tmp, target)
}

module.exports = { configPath, readWorkspaceConfig, writeWorkspaceConfig }
