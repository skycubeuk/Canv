'use strict'

const { requireCapability } = require('../capability.cjs')
const { requireCaller } = require('./active-doc.cjs')

const EVENT_TO_CAP = {
  activeDocChanged: 'events.docChanged',
  selectionChanged: 'events.selectionChanged',
  docSaved: 'events.docSaved',
  workspaceChanged: 'events.workspaceChanged',
  // fileHandler-specific: no capability required (the event is about the file
  // that the fileHandler extension itself has open)
  'activeFile.changed': null,
}

// Returns the required capability string, an empty string (no capability needed),
// or undefined if the event type is unknown.
function capabilityForEventType(t) {
  if (!Object.prototype.hasOwnProperty.call(EVENT_TO_CAP, t)) return undefined
  return EVENT_TO_CAP[t]
}

function createEventsHandlers({ runtime }) {
  return {
    'canvExt:events.subscribe': async (event, eventType) => {
      const { id, manifest } = requireCaller(runtime, event)
      const cap = capabilityForEventType(eventType)
      if (cap === undefined) throw new Error(`unknown event type "${eventType}"`)
      if (cap !== null) requireCapability(manifest, cap)
      runtime.subscribe(id, eventType)
    },
    'canvExt:events.unsubscribe': async (event, eventType) => {
      const { id } = requireCaller(runtime, event)
      runtime.unsubscribe(id, eventType)
    },
  }
}

module.exports = { createEventsHandlers, capabilityForEventType }
