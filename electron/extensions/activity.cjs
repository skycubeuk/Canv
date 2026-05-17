'use strict'

const counters = new Map() // id → { tokensIn, tokensOut, netRequests }

function ensure(id) {
  if (!counters.has(id)) counters.set(id, { tokensIn: 0, tokensOut: 0, netRequests: 0 })
  return counters.get(id)
}

function recordAi(id, usage) {
  const c = ensure(id)
  c.tokensIn += usage?.in ?? 0
  c.tokensOut += usage?.out ?? 0
}

function recordNet(id) { ensure(id).netRequests++ }

function get(id) {
  return counters.has(id)
    ? { ...counters.get(id) }
    : { tokensIn: 0, tokensOut: 0, netRequests: 0 }
}

function reset(id) { counters.delete(id) }

// Test affordance only — clears all extension counters.
function _resetAllForTest() { counters.clear() }

module.exports = { recordAi, recordNet, get, reset, _resetAllForTest }
