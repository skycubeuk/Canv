'use strict'

const { requireCapability } = require('../capability.cjs')

function requireCaller(runtime, event) {
  const id = runtime.webContentsIdToExtension(event.sender.id)
  if (!id) throw new Error('unknown caller (webContents id has no extension binding)')
  const manifest = runtime.manifestFor(id)
  if (!manifest) throw new Error(`extension ${id} has no manifest`)
  return { id, manifest }
}

function assertString(v, name) {
  if (typeof v !== 'string') throw new TypeError(`${name} must be a string`)
}

function createActiveDocHandlers({ runtime, host }) {
  return {
    'canvExt:activeDoc.getText': async (event) => {
      const { manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'activeDoc.read')
      return host.getActiveDocText()
    },
    'canvExt:activeDoc.getPath': async (event) => {
      const { manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'activeDoc.read')
      return host.getActiveDocPath()
    },
    'canvExt:activeDoc.getSelection': async (event) => {
      const { manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'activeDoc.read')
      return host.getActiveDocSelection()
    },
    'canvExt:activeDoc.insertAtCursor': async (event, text) => {
      const { manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'activeDoc.write')
      assertString(text, 'text')
      return host.insertAtCursor(text)
    },
    'canvExt:activeDoc.replaceSelection': async (event, text) => {
      const { manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'activeDoc.write')
      assertString(text, 'text')
      return host.replaceSelection(text)
    },
    'canvExt:activeDoc.setText': async (event, text) => {
      const { manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'activeDoc.write')
      assertString(text, 'text')
      return host.setActiveDocText(text)
    },
  }
}

module.exports = { createActiveDocHandlers, requireCaller, assertString }
