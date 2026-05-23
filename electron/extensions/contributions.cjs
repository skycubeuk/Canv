'use strict'
const fs = require('node:fs')
const path = require('node:path')

const EMPTY = Object.freeze({
  panels: [], fileHandlers: [], commands: [], menus: [], statusBarItems: [], languages: [],
})

function buildAllContributions(workspaceExtensionsDir, registryEntries) {
  const out = {
    panels: [], fileHandlers: [], commands: [], menus: [], statusBarItems: [], languages: [],
  }
  for (const entry of registryEntries) {
    if (!entry.enabled || entry.trustedAt == null) continue
    const dir = path.join(workspaceExtensionsDir, entry.id)
    let manifest
    try { manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8')) }
    catch { continue }
    const extensionName = manifest.name || entry.id
    const contribs = Array.isArray(manifest.contributions) ? manifest.contributions : []
    for (const c of contribs) {
      if (!c || typeof c !== 'object') continue
      switch (c.type) {
        case 'panel':
          out.panels.push({ extensionId: entry.id, id: c.id, title: c.title, icon: c.icon, location: c.location, entry: c.entry })
          break
        case 'fileHandler':
          out.fileHandlers.push({ extensionId: entry.id, id: c.id, extensions: c.extensions, mode: c.mode, entry: c.entry })
          break
        case 'command':
          out.commands.push({ extensionId: entry.id, extensionName, id: c.id, title: c.title, entry: c.entry, keybinding: c.keybinding })
          break
        case 'menu':
          out.menus.push({ extensionId: entry.id, menu: c.menu, command: c.command, title: c.title, when: c.when })
          break
        case 'statusBar':
          out.statusBarItems.push({ extensionId: entry.id, id: c.id, alignment: c.alignment, priority: c.priority, text: c.text, icon: c.icon, tooltip: c.tooltip, command: c.command })
          break
        case 'language':
          out.languages.push({ extensionId: entry.id, extensions: c.extensions, entry: c.entry })
          break
      }
    }
  }
  return out
}

module.exports = { buildAllContributions, EMPTY }
