'use strict'

const { requireCapability } = require('../capability.cjs')
const { requireCaller, assertString } = require('./active-doc.cjs')

function ensureSerializable(v) {
  try { JSON.stringify(v) } catch { throw new TypeError('value is not JSON-serializable') }
  if (typeof v === 'function') throw new TypeError('value is not JSON-serializable')
  if (typeof v === 'object' && v !== null) {
    // Walk for functions — JSON.stringify silently drops them, which we treat as an error.
    const stack = [v]
    while (stack.length) {
      const cur = stack.pop()
      if (Array.isArray(cur)) { for (const item of cur) if (item && typeof item === 'object') stack.push(item) }
      else if (typeof cur === 'object') {
        for (const k of Object.keys(cur)) {
          const c = cur[k]
          if (typeof c === 'function') throw new TypeError('value is not JSON-serializable')
          if (c && typeof c === 'object') stack.push(c)
        }
      }
    }
  }
}

function createStorageHandlers({ runtime }) {
  return {
    'canvExt:storage.get': async (event, key) => {
      const { id, manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'storage')
      assertString(key, 'key')
      return runtime.storageFor(id).get(key)
    },
    'canvExt:storage.set': async (event, key, value) => {
      const { id, manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'storage')
      assertString(key, 'key')
      ensureSerializable(value)
      runtime.storageFor(id).set(key, value)
    },
    'canvExt:storage.delete': async (event, key) => {
      const { id, manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'storage')
      assertString(key, 'key')
      runtime.storageFor(id).delete(key)
    },
    'canvExt:storage.keys': async (event) => {
      const { id, manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'storage')
      return runtime.storageFor(id).keys()
    },
  }
}

module.exports = { createStorageHandlers, ensureSerializable }
