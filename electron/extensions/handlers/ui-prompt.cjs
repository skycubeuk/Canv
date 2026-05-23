'use strict'

const { requireCapability } = require('../capability.cjs')
const { requireCaller, assertString } = require('./active-doc.cjs')

function createUiPromptHandlers({ runtime, host }) {
  return {
    'canvExt:ui.quickPick': async (event, items, opts = {}) => {
      const { id, manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'ui')
      if (!Array.isArray(items)) throw new TypeError('items must be an array')
      const cleanItems = items.map((it, i) => {
        if (!it || typeof it.label !== 'string') throw new TypeError(`items[${i}].label must be a string`)
        return {
          label: it.label,
          description: typeof it.description === 'string' ? it.description : undefined,
          value: it.value,
        }
      })
      const reply = await host.showPrompt({
        kind: 'quickPick', extensionId: id, items: cleanItems,
        placeholder: typeof opts.placeholder === 'string' ? opts.placeholder : undefined,
      })
      if (reply == null) return null
      return reply.value ?? null
    },
    'canvExt:ui.input': async (event, opts = {}) => {
      const { id, manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'ui')
      assertString(opts.prompt, 'prompt')
      const reply = await host.showPrompt({
        kind: 'input', extensionId: id,
        prompt: opts.prompt,
        placeholder: typeof opts.placeholder === 'string' ? opts.placeholder : undefined,
        defaultValue: typeof opts.default === 'string' ? opts.default : undefined,
      })
      if (reply == null) return null
      return typeof reply.value === 'string' ? reply.value : null
    },
  }
}

module.exports = { createUiPromptHandlers }
