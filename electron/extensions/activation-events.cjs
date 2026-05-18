'use strict'

function effectiveActivationEvents(manifest) {
  const declared = Array.isArray(manifest.activationEvents) ? manifest.activationEvents : []
  if (declared.length > 0) return declared.slice()
  const inferred = []
  const contribs = Array.isArray(manifest.contributions) ? manifest.contributions : []
  const seenMenus = new Set()
  for (const c of contribs) {
    if (!c) continue
    if (c.type === 'panel' && c.location && c.id) {
      inferred.push(`onPanelOpen:${c.location}:${c.id}`)
    } else if (c.type === 'fileHandler' && Array.isArray(c.extensions)) {
      for (const ext of c.extensions) inferred.push(`onFileType:${ext}`)
    } else if (c.type === 'language' && Array.isArray(c.extensions)) {
      for (const ext of c.extensions) inferred.push(`onLanguage:${ext}`)
    } else if (c.type === 'statusBar') {
      if (!inferred.includes('onStatusBarRender')) inferred.push('onStatusBarRender')
    } else if (c.type === 'command' && c.id) {
      inferred.push(`onCommand:${c.id}`)
    } else if (c.type === 'menu' && c.menu && !seenMenus.has(c.menu)) {
      seenMenus.add(c.menu)
      inferred.push(`onMenuOpen:${c.menu}`)
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
  if (eventStr === 'onStatusBarRender') return trigger.kind === 'statusBarRender'
  if (eventStr.startsWith('onCommand:') && trigger.kind === 'command') {
    return eventStr.slice('onCommand:'.length) === trigger.commandId
  }
  if (eventStr.startsWith('onPanelOpen:') && trigger.kind === 'panelOpen') {
    const [location, panelId] = eventStr.slice('onPanelOpen:'.length).split(':')
    return location === trigger.location && panelId === trigger.panelId
  }
  if (eventStr.startsWith('onFileType:') && trigger.kind === 'fileType') {
    return eventStr.slice('onFileType:'.length) === trigger.ext
  }
  if (eventStr.startsWith('onLanguage:') && trigger.kind === 'language') {
    return eventStr.slice('onLanguage:'.length) === trigger.ext
  }
  if (eventStr.startsWith('onMenuOpen:') && trigger.kind === 'menuOpen') {
    return eventStr.slice('onMenuOpen:'.length) === trigger.menu
  }
  return false
}

module.exports = { effectiveActivationEvents, shouldActivateFor }
