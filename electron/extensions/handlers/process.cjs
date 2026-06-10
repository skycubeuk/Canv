'use strict'

const { requireCapability } = require('../capability.cjs')
const { requireCaller, assertString } = require('./active-doc.cjs')

// Run an external binary on the user's machine. Heavily gated:
//   1. the extension must declare the `process` capability (elevated — shown
//      prominently in the install consent modal), and
//   2. the requested binary must be in the extension's `executables` allowlist,
//      also surfaced at install time.
// The actual execFile happens in the host (services/extensions) so this handler
// stays a thin, unit-testable policy gate.
function createProcessHandlers({ runtime, host }) {
  return {
    'canvExt:process.exec': async (event, binary, args) => {
      const { manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'process')
      assertString(binary, 'binary')
      const allow = Array.isArray(manifest.executables) ? manifest.executables : []
      if (!allow.includes(binary)) {
        throw new Error(`executable not whitelisted: ${binary} (manifest.executables: ${allow.join(', ') || '(none)'})`)
      }
      if (!Array.isArray(args)) throw new TypeError('args must be an array of strings')
      for (const a of args) {
        if (typeof a !== 'string') throw new TypeError('args must be an array of strings')
      }
      return host.execAllowed(binary, args)
    },
  }
}

module.exports = { createProcessHandlers }
