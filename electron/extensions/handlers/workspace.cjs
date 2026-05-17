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
  }
}

module.exports = { createWorkspaceHandlers }
