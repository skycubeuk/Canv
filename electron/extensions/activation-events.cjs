'use strict'

function effectiveActivationEvents(manifest) {
  const declared = Array.isArray(manifest.activationEvents) ? manifest.activationEvents : []
  if (declared.length > 0) return declared.slice()
  const inferred = []
  const contribs = Array.isArray(manifest.contributions) ? manifest.contributions : []
  for (const c of contribs) {
    if (c && c.type === 'panel' && c.location && c.id) {
      inferred.push(`onPanelOpen:${c.location}:${c.id}`)
    }
  }
  return inferred
}

function shouldActivateFor(manifest, trigger) {
  const events = effectiveActivationEvents(manifest)
  for (const e of events) {
    if (matches(e, trigger)) return true
  }
  return false
}

function matches(eventStr, trigger) {
  if (eventStr === 'onStartup') return trigger.kind === 'startup'
  if (eventStr.startsWith('onCommand:') && trigger.kind === 'command') {
    return eventStr.slice('onCommand:'.length) === trigger.commandId
  }
  if (eventStr.startsWith('onPanelOpen:') && trigger.kind === 'panelOpen') {
    const [location, panelId] = eventStr.slice('onPanelOpen:'.length).split(':')
    return location === trigger.location && panelId === trigger.panelId
  }
  return false
}

module.exports = { effectiveActivationEvents, shouldActivateFor }
