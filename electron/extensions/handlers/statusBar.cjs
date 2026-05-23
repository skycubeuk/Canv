'use strict'
const { requireCapability } = require('../capability.cjs')
const { requireCaller } = require('./active-doc.cjs')

function findStatusBarContribution(manifest, id) {
  const contribs = Array.isArray(manifest.contributions) ? manifest.contributions : []
  return contribs.find((c) => c && c.type === 'statusBar' && c.id === id) || null
}

function createStatusBarHandlers({ runtime, host }) {
  return {
    'canvExt:ui.setStatusBarItem': async (event, itemId, partial) => {
      const { id: extensionId, manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'ui')
      if (typeof itemId !== 'string') throw new TypeError('itemId must be a string')
      const contrib = findStatusBarContribution(manifest, itemId)
      if (!contrib) throw new Error(`unknown statusBar id "${itemId}" (not declared in this extension's manifest)`)
      const update = {}
      if (partial && typeof partial === 'object') {
        for (const k of ['text', 'icon', 'tooltip']) {
          if (k in partial) {
            if (typeof partial[k] !== 'string') throw new TypeError(`${k} must be a string`)
            update[k] = partial[k]
          }
        }
      }
      host.onStatusBarItemUpdated(itemId, { extensionId, id: itemId, ...update })
    },
  }
}

module.exports = { createStatusBarHandlers }
