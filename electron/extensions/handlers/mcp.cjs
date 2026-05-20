'use strict'

const { requireCapability } = require('../capability.cjs')
const { requireCaller } = require('./active-doc.cjs')

function createMcpHandlers({ runtime, getMcpService }) {
  return {
    'canvExt:mcp.call': async (event, name, args) => {
      const { manifest } = requireCaller(runtime, event)
      // Throw on capability-denial to match ai.cjs / net.cjs conventions —
      // the renderer adapter surfaces the rejection as a thrown Error.
      requireCapability(manifest, 'mcp.call')
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
