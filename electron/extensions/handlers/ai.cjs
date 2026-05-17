'use strict'

const { requireCapability } = require('../capability.cjs')
const { requireCaller, assertString } = require('./active-doc.cjs')

const MAX_TOKENS_HARD_CAP = 8192

function createAiHandlers({ runtime, host }) {
  return {
    'canvExt:ai.ask': async (event, prompt, opts = {}) => {
      const { id, manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'ai')
      assertString(prompt, 'prompt')
      const params = {
        extensionId: id,
        prompt,
        system: typeof opts.system === 'string' ? opts.system : undefined,
        maxTokens: typeof opts.maxTokens === 'number'
          ? Math.min(opts.maxTokens, MAX_TOKENS_HARD_CAP)
          : undefined,
        profileId: typeof opts.profileId === 'string' ? opts.profileId : undefined,
      }
      return host.askAI(params)
    },
  }
}

module.exports = { createAiHandlers, MAX_TOKENS_HARD_CAP }
