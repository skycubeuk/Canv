'use strict'

const { requireCapability } = require('../capability.cjs')
const { requireCaller, assertString } = require('./active-doc.cjs')
const { PersistentStorage } = require('../storage-file.cjs')

const stores = new Map() // extensionId → PersistentStorage

function storeFor(id, settingsFileFor) {
  if (!stores.has(id)) stores.set(id, new PersistentStorage(settingsFileFor(id)))
  return stores.get(id)
}

function _clearStoresForTest() {
  stores.clear()
}

function defFor(manifest, key) {
  const defs = Array.isArray(manifest.settings) ? manifest.settings : []
  return defs.find((d) => d.key === key) || null
}

function validateValue(def, value) {
  switch (def.type) {
    case 'string':
    case 'color':
    case 'multiline':
    case 'path':
      if (typeof value !== 'string') throw new TypeError(`setting "${def.key}" requires a string`)
      return
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) throw new TypeError(`setting "${def.key}" requires a number`)
      if (def.min != null && value < def.min) throw new RangeError(`setting "${def.key}" min is ${def.min}`)
      if (def.max != null && value > def.max) throw new RangeError(`setting "${def.key}" max is ${def.max}`)
      return
    case 'boolean':
      if (typeof value !== 'boolean') throw new TypeError(`setting "${def.key}" requires a boolean`)
      return
    case 'enum':
      if (typeof value !== 'string' || !def.options.includes(value)) {
        throw new RangeError(`setting "${def.key}" must be one of options: ${def.options.join(', ')}`)
      }
      return
    default:
      throw new Error(`unknown setting type: ${def.type}`)
  }
}

function createSettingsHandlers({ runtime, settingsFileFor }) {
  return {
    'canvExt:settings.get': async (event, key) => {
      const { id, manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'settings')
      assertString(key, 'key')
      const def = defFor(manifest, key)
      if (!def) throw new Error(`unknown setting key "${key}"`)
      const user = await storeFor(id, settingsFileFor).get(key)
      return user !== undefined ? user : def.default
    },
    'canvExt:settings.set': async (event, key, value) => {
      const { id, manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'settings')
      assertString(key, 'key')
      const def = defFor(manifest, key)
      if (!def) throw new Error(`unknown setting key "${key}"`)
      validateValue(def, value)
      await storeFor(id, settingsFileFor).set(key, value)
    },
    'canvExt:settings.getAll': async (event) => {
      const { id, manifest } = requireCaller(runtime, event)
      requireCapability(manifest, 'settings')
      const defs = Array.isArray(manifest.settings) ? manifest.settings : []
      const out = {}
      for (const d of defs) out[d.key] = d.default
      const store = storeFor(id, settingsFileFor)
      for (const k of await store.keys()) {
        if (defFor(manifest, k)) out[k] = await store.get(k)
      }
      return out
    },
  }
}

module.exports = { createSettingsHandlers, validateValue, defFor, _clearStoresForTest }
