// electron/extensions/capability.cjs
'use strict'

const ALL_CAPABILITIES = Object.freeze([
  'activeDoc.read', 'activeDoc.write',
  'workspace.list', 'workspace.read', 'workspace.write',
  'selection.read', 'selection.write',
  'events.docChanged', 'events.selectionChanged', 'events.docSaved', 'events.workspaceChanged',
  'storage', 'settings', 'ai', 'notify', 'ui',
])

const CAPABILITY_SET = new Set(ALL_CAPABILITIES)

function isKnownCapability(cap) {
  return typeof cap === 'string' && CAPABILITY_SET.has(cap)
}

class CapabilityError extends Error {
  constructor(extensionId, missing) {
    super(`extension "${extensionId}" lacks required capability "${missing}"`)
    this.name = 'CapabilityError'
    this.extensionId = extensionId
    this.missing = missing
    this.code = 'CAPABILITY_DENIED'
  }
}

function requireCapability(manifest, cap) {
  if (!isKnownCapability(cap)) {
    throw new Error(`unknown capability "${cap}" — developer error`)
  }
  const declared = manifest && Array.isArray(manifest.capabilities) ? manifest.capabilities : []
  if (!declared.includes(cap)) {
    throw new CapabilityError(manifest?.id ?? '<unknown>', cap)
  }
}

module.exports = { ALL_CAPABILITIES, isKnownCapability, requireCapability, CapabilityError }
