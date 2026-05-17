'use strict'

class InMemoryStorage {
  constructor() { this._m = new Map() }
  get(k)    { return this._m.get(k) }
  set(k, v) { this._m.set(k, v) }
  delete(k) { this._m.delete(k) }
  keys()    { return Array.from(this._m.keys()) }
}

class ExtensionRuntime {
  constructor(opts = {}) {
    this._byId = new Map()              // id → { manifest, extensionDir, webContentsId, view?, storage, subscriptions: Set<eventType> }
    this._wcIdToId = new Map()          // webContents.id → extension id
    this._eventDispatcher = opts.eventDispatcher || null  // called to deliver events to the renderer; injected by main.cjs wiring
    this._electron = opts.electron || null
    this._extensionPreloadPath = opts.extensionPreloadPath || null
    this._openDevToolsOnSpawn = Boolean(opts.openDevToolsOnSpawn)
  }

  list() {
    return Array.from(this._byId.values()).map((e) => ({
      id: e.manifest.id, manifest: e.manifest, extensionDir: e.extensionDir,
    }))
  }

  extensionDirFor(id) {
    const e = this._byId.get(id); return e ? e.extensionDir : null
  }

  manifestFor(id) {
    const e = this._byId.get(id); return e ? e.manifest : null
  }

  webContentsIdToExtension(wcId) {
    return this._wcIdToId.get(wcId) ?? null
  }

  storageFor(id) {
    const e = this._byId.get(id)
    if (!e) throw new Error(`unknown extension "${id}"`)
    return e.storage
  }

  subscribe(id, eventType) {
    const e = this._byId.get(id)
    if (!e) return
    e.subscriptions.add(eventType)
  }
  unsubscribe(id, eventType) {
    const e = this._byId.get(id)
    if (!e) return
    e.subscriptions.delete(eventType)
  }
  subscriptionsFor(id) {
    const e = this._byId.get(id)
    return e ? Array.from(e.subscriptions) : []
  }

  // Dispatch an event to every extension that has subscribed to it.
  dispatchEvent(eventType, payload) {
    if (!this._eventDispatcher) return
    for (const e of this._byId.values()) {
      if (e.subscriptions.has(eventType)) {
        this._eventDispatcher(e.webContentsId, eventType, payload)
      }
    }
  }

  // ------------------------------------------------------------------
  // Electron lifecycle. Requires the runtime to have been constructed
  // with { electron, extensionPreloadPath } so it can create WebContentsViews.
  // ------------------------------------------------------------------

  async spawn({ extensionDir, manifest, hostWindow, bounds }) {
    if (!this._electron) throw new Error('runtime not bound to electron (constructor opts.electron)')
    if (this._byId.has(manifest.id)) throw new Error(`extension "${manifest.id}" already spawned`)

    const { WebContentsView } = this._electron
    const view = new WebContentsView({
      webPreferences: {
        preload: this._extensionPreloadPath,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        webSecurity: true,
        spellcheck: false,
        backgroundThrottling: false,
      },
    })

    // Register BEFORE load so protocol handler / IPC handlers can resolve the
    // webContents id to its extension during the initial entry-html fetch.
    this._byId.set(manifest.id, {
      manifest, extensionDir, webContentsId: view.webContents.id, view,
      storage: new InMemoryStorage(),
      subscriptions: new Set(),
    })
    this._wcIdToId.set(view.webContents.id, manifest.id)

    // Track which host window we're attached to so destroy() can detach.
    view._hostWindow = hostWindow

    // Attach to the host window's contentView and size.
    hostWindow.contentView.addChildView(view)
    if (bounds) view.setBounds(bounds)

    // Right-click → Inspect, for both dev and packaged dev-builds. The default
    // WebContentsView has no context menu; without this, there is no way to
    // open DevTools on an extension from inside Canv.
    if (this._electron && this._electron.Menu) {
      view.webContents.on('context-menu', (_event, params) => {
        const menu = this._electron.Menu.buildFromTemplate([
          { label: 'Reload', click: () => view.webContents.reload() },
          { type: 'separator' },
          {
            label: 'Inspect Extension',
            click: () => view.webContents.inspectElement(params.x, params.y),
          },
          {
            label: 'Open Extension DevTools',
            click: () => view.webContents.openDevTools({ mode: 'detach' }),
          },
        ])
        menu.popup({ window: hostWindow })
      })
    }

    // Load entry; the protocol handler serves canv-extension://<id>/ → <extensionDir>/index.html
    // (or panels/main.html if the manifest's first panel contribution declares one).
    const firstPanel = manifest.contributions.find((c) => c.type === 'panel')
    const entryRel = firstPanel ? firstPanel.entry : 'index.html'
    await view.webContents.loadURL(`canv-extension://${manifest.id}/${entryRel}`)

    // Open DevTools in dev for the extension renderer (AFTER load so it attaches
    // cleanly and shows the loaded page rather than about:blank).
    if (this._openDevToolsOnSpawn) {
      view.webContents.openDevTools({ mode: 'detach' })
    }

    // Fire activate event.
    view.webContents.send('canvExt:lifecycle.activate', { reason: 'spawn' })

    return view
  }

  async destroy(extensionId, { reason = 'unload' } = {}) {
    const e = this._byId.get(extensionId)
    if (!e) return
    try { e.view.webContents.send('canvExt:lifecycle.unload', { reason }) } catch { /* ignore */ }
    // Detach from host window.
    try {
      if (e.view._hostWindow) e.view._hostWindow.contentView.removeChildView(e.view)
    } catch { /* ignore */ }
    // Destroy the WebContents (Electron will clean up the WebContentsView).
    try { e.view.webContents.close({ waitForBeforeUnload: false }) } catch { /* ignore */ }
    this._wcIdToId.delete(e.webContentsId)
    this._byId.delete(extensionId)
  }

  setBounds(extensionId, bounds) {
    const e = this._byId.get(extensionId)
    if (!e) return
    e.view.setBounds(bounds)
  }

  // --- Test affordances. Real `spawn`/`destroy` land in Task 15. ---
  _registerForTest({ id, manifest, extensionDir, webContentsId, view = null }) {
    this._byId.set(id, {
      manifest, extensionDir, webContentsId, view,
      storage: new InMemoryStorage(),
      subscriptions: new Set(),
    })
    this._wcIdToId.set(webContentsId, id)
  }
  _unregisterForTest(id) {
    const e = this._byId.get(id)
    if (!e) return
    this._wcIdToId.delete(e.webContentsId)
    this._byId.delete(id)
  }
}

module.exports = { ExtensionRuntime, InMemoryStorage }
