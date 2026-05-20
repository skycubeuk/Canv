'use strict'

const { requireCapability } = require('../capability.cjs')
const { requireCaller } = require('./active-doc.cjs')

function createMcpHandlers({ runtime, getMcpService }) {
  return {
    'canvExt:mcp.call': async (event, name, args) => {
      const { manifest } = requireCaller(runtime, event)
      try { requireCapability(manifest, 'mcp.call') }
      catch (err) { return { ok: false, error: err.message } }
      const allowlist = (manifest.mcp && manifest.mcp.tools) || []
      if (!allowlist.includes(name)) {
        return { ok: false, error: `tool "${name}" is not in manifest.mcp.tools` }
      }
      const mcp = typeof getMcpService === 'function' ? getMcpService() : null
      if (!mcp) return { ok: false, error: 'mcp service not initialised' }
      return await mcp.callTool(name, args)
    },
  }
}

module.exports = { createMcpHandlers }
