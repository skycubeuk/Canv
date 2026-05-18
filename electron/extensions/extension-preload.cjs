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
  settings: {
    get:     (key) => ipcRenderer.invoke('canvExt:settings.get', key),
    set:     (key, value) => ipcRenderer.invoke('canvExt:settings.set', key, value),
    getAll:  () => ipcRenderer.invoke('canvExt:settings.getAll'),
    onChange(handler) {
      const listener = (_e, payload) => {
        try { handler(payload.key, payload.value) } catch { /* swallow */ }
      }
      ipcRenderer.on('canvExt:settings.changed', listener)
      return () => ipcRenderer.removeListener('canvExt:settings.changed', listener)
    },
  },
  ai: {
    ask: (prompt, opts) => ipcRenderer.invoke('canvExt:ai.ask', prompt, opts ?? {}),
  },
  ui: {
    notify:           (msg, kind) => ipcRenderer.invoke('canvExt:ui.notify', msg, kind ?? 'info'),
    confirm:          (msg) => ipcRenderer.invoke('canvExt:ui.confirm', msg),
    copyToClipboard:  (text) => ipcRenderer.invoke('canvExt:ui.copyToClipboard', text),
    quickPick:        (items, opts) => ipcRenderer.invoke('canvExt:ui.quickPick', items, opts ?? {}),
    input:            (opts) => ipcRenderer.invoke('canvExt:ui.input', opts ?? {}),
    setStatusBarItem: (id, partial) => ipcRenderer.invoke('canvExt:ui.setStatusBarItem', id, partial),
  },
  net: {
    fetch: async (url, init) => {
      const r = await ipcRenderer.invoke('canvExt:net.fetch', url, init)
      // Reshape flat IPC payload into a Response-like object so extension code
      // can call .text() / .json() in a familiar pattern. Body was already
      // serialised to text in the main handler.
      return {
        ok: r.ok,
        status: r.status,
        statusText: r.statusText,
        headers: new Headers(r.headers || {}),
        text: () => Promise.resolve(r.body),
        json: () => Promise.resolve(JSON.parse(r.body)),
      }
    },
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
  commands: {
    onInvoke(cb) {
      const listener = (_e, payload) => { try { cb(payload.commandId, payload.args) } catch { /* ignore */ } }
      ipcRenderer.on('canvExt:commands.invoke', listener)
      return () => ipcRenderer.removeListener('canvExt:commands.invoke', listener)
    },
  },
})
