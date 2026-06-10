'use strict'

const { requireCapability } = require('../capability.cjs')
const { requireCaller, assertString } = require('./active-doc.cjs')

function createWorkspaceHandlers({ runtime, host }) {
  return {
    'canvExt:workspace.getRoot': async (event) => {
      requireCaller(runtime, event) // identity check only; no capability required
      return host.getWorkspaceRoot()
    },
    'canvExt:workspace.list': async (event, globOrDir) => {
      const { manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'workspace.list')
      if (globOrDir != null && typeof globOrDir !== 'string') {
        throw new TypeError('globOrDir must be a string or null')
      }
      return host.listWorkspace(globOrDir ?? null)
    },
    'canvExt:workspace.readText': async (event, relPath) => {
      const { manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'workspace.read')
      assertString(relPath, 'relPath')
      return host.readWorkspaceText(relPath)
    },
    'canvExt:workspace.writeText': async (event, relPath, text) => {
      const { manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'workspace.write')
      assertString(relPath, 'relPath')
      assertString(text, 'text')
      const allow = Array.isArray(manifest.writePaths) ? manifest.writePaths : []
      const norm = relPath.replace(/\\/g, '/').replace(/^\.\/+/, '')
      const allowed = allow.some((p) => {
        const pre = p.endsWith('/') ? p : `${p}/`
        return norm === p || norm.startsWith(pre)
      })
      if (!allowed) {
        throw new Error(`write path not whitelisted: ${relPath} (manifest.writePaths: ${allow.join(', ') || '(none)'})`)
      }
      return host.writeWorkspaceText(relPath, text)
    },
  }
}

module.exports = { createWorkspaceHandlers }
