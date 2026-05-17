'use strict'

const { contextBridge, ipcRenderer } = require('electron')

function makeEventBus(channel) {
  return {
    on(event, handler) {
      if (typeof event !== 'string' || typeof handler !== 'function') return () => {}
      const listener = (_e, payload) => {
        if (payload && payload.type === event) {
          try { handler(payload.payload) } catch { /* swallow */ }
        }
      }
      ipcRenderer.on(channel, listener)
      // Tell main side we want this event type — main process tracks per-extension subscriptions.
      ipcRenderer.invoke('canvExt:events.subscribe', event).catch(() => {})
      return () => {
        ipcRenderer.removeListener(channel, listener)
        ipcRenderer.invoke('canvExt:events.unsubscribe', event).catch(() => {})
      }
    },
  }
}

contextBridge.exposeInMainWorld('canv', {
  activeDoc: {
    getText:           () => ipcRenderer.invoke('canvExt:activeDoc.getText'),
    getPath:           () => ipcRenderer.invoke('canvExt:activeDoc.getPath'),
    getSelection:      () => ipcRenderer.invoke('canvExt:activeDoc.getSelection'),
    insertAtCursor:    (text) => ipcRenderer.invoke('canvExt:activeDoc.insertAtCursor', text),
    replaceSelection:  (text) => ipcRenderer.invoke('canvExt:activeDoc.replaceSelection', text),
    setText:           (text) => ipcRenderer.invoke('canvExt:activeDoc.setText', text),
  },
  workspace: {
    getRoot:  () => ipcRenderer.invoke('canvExt:workspace.getRoot'),
    list:     (globOrDir) => ipcRenderer.invoke('canvExt:workspace.list', globOrDir ?? null),
    readText: (relPath) => ipcRenderer.invoke('canvExt:workspace.readText', relPath),
  },
  events: makeEventBus('canvExt:event'),
  storage: {
    get:    (key) => ipcRenderer.invoke('canvExt:storage.get', key),
    set:    (key, value) => ipcRenderer.invoke('canvExt:storage.set', key, value),
    delete: (key) => ipcRenderer.invoke('canvExt:storage.delete', key),
    keys:   () => ipcRenderer.invoke('canvExt:storage.keys'),
  },
  ui: {
    notify:           (msg, kind) => ipcRenderer.invoke('canvExt:ui.notify', msg, kind ?? 'info'),
    confirm:          (msg) => ipcRenderer.invoke('canvExt:ui.confirm', msg),
    copyToClipboard:  (text) => ipcRenderer.invoke('canvExt:ui.copyToClipboard', text),
  },
  lifecycle: {
    onActivate(handler) {
      const listener = (_e, ctx) => { try { handler(ctx) } catch { /* swallow */ } }
      ipcRenderer.on('canvExt:lifecycle.activate', listener)
      return () => ipcRenderer.removeListener('canvExt:lifecycle.activate', listener)
    },
    onUnload(handler) {
      const listener = (_e, ctx) => { try { handler(ctx) } catch { /* swallow */ } }
      ipcRenderer.on('canvExt:lifecycle.unload', listener)
      return () => ipcRenderer.removeListener('canvExt:lifecycle.unload', listener)
    },
  },
})
