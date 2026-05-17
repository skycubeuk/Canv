'use strict'

const { requireCapability } = require('../capability.cjs')
const { requireCaller, assertString } = require('./active-doc.cjs')

const KINDS = new Set(['info', 'warn', 'error'])

function createUiHandlers({ runtime, host }) {
  return {
    'canvExt:ui.notify': async (event, message, kind) => {
      const { id, manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'notify')
      assertString(message, 'message')
      if (!KINDS.has(kind)) throw new Error(`kind must be one of info|warn|error (got ${JSON.stringify(kind)})`)
      host.notifyToMainWindow(message, kind, id)
    },
    'canvExt:ui.confirm': async (event, message) => {
      const { manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'ui')
      assertString(message, 'message')
      const result = await host.showConfirmDialog(message)
      return Boolean(result)
    },
    'canvExt:ui.copyToClipboard': async (event, text) => {
      const { manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'ui')
      assertString(text, 'text')
      host.writeClipboard(text)
    },
  }
}

module.exports = { createUiHandlers, KINDS }
