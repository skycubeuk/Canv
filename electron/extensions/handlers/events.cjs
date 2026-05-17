'use strict'

const { requireCapability } = require('../capability.cjs')
const { requireCaller } = require('./active-doc.cjs')

const EVENT_TO_CAP = {
  activeDocChanged: 'events.docChanged',
  selectionChanged: 'events.selectionChanged',
  docSaved: 'events.docSaved',
  workspaceChanged: 'events.workspaceChanged',
}

function capabilityForEventType(t) {
  return Object.prototype.hasOwnProperty.call(EVENT_TO_CAP, t) ? EVENT_TO_CAP[t] : null
}

function createEventsHandlers({ runtime }) {
  return {
    'canvExt:events.subscribe': async (event, eventType) => {
      const { id, manifest } = requireCaller(runtime, event)
      const cap = capabilityForEventType(eventType)
      if (!cap) throw new Error(`unknown event type "${eventType}"`)
      requireCapability(manifest, cap)
      runtime.subscribe(id, eventType)
    },
    'canvExt:events.unsubscribe': async (event, eventType) => {
      const { id } = requireCaller(runtime, event)
      runtime.unsubscribe(id, eventType)
    },
  }
}

module.exports = { createEventsHandlers, capabilityForEventType }
