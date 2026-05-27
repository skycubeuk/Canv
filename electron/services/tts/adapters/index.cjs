'use strict'
const { elevenlabsAdapter } = require('./elevenlabs.cjs')

const ttsAdapters = { elevenlabs: elevenlabsAdapter }

function getTtsAdapter(id) {
  const a = ttsAdapters[id || 'elevenlabs']
  if (!a) throw new Error(`unknown tts provider: ${id}`)
  return a
}

module.exports = { ttsAdapters, getTtsAdapter }
