const { contextBridge, ipcRenderer } = require('electron')

function isDockPopout() {
  try {
    return new URLSearchParams(location.search).get('mode') === 'dock'
  } catch {
    return false
  }
}

// ---------- Screenshot harness: seed localStorage before React runs ----------
// main.cjs passes CANV_SCREENSHOT_* values via additionalArguments, which
// appear in process.argv even in sandboxed preloads. We write them into
// localStorage here (synchronously) so useWorkspace / useSettings read them
// on first mount without any race conditions.
;(function seedScreenshotLocals() {
  try {
    let ws = ''
    let theme = ''
    for (const arg of process.argv) {
      if (arg.startsWith('--canv-screenshot-workspace=')) {
        ws = arg.slice('--canv-screenshot-workspace='.length)
      } else if (arg.startsWith('--canv-screenshot-theme=')) {
        theme = arg.slice('--canv-screenshot-theme='.length)
      }
    }
    if (ws) {
      // useWorkspace reads 'canv:lastWorkspace' on boot to reopen the last folder.
      localStorage.setItem('canv:lastWorkspace', ws)
    }
    if (theme === 'dark' || theme === 'light') {
      // useSettings reads 'canv:settings'; merge theme into any existing blob.
      const raw = localStorage.getItem('canv:settings')
      const existing = raw ? JSON.parse(raw) : {}
      localStorage.setItem('canv:settings', JSON.stringify({ ...existing, theme }))
    }
    const profileArg = process.argv.find((a) => a.startsWith('--canv-screenshot-profile='))
    const profile = profileArg ? profileArg.slice('--canv-screenshot-profile='.length) : ''
    if (profile) {
      // useLocalStorage JSON.stringify-s its values; match that convention.
      try {
        localStorage.setItem('canv:profile', JSON.stringify(profile))
      } catch {}
    }
    // Seed v1 legacy keys so the MigrationModal appears for the settings-and-data
    // migration screenshot. Only active when CANV_SCREENSHOT_SEED_LEGACY=1.
    const seedLegacyArg = process.argv.find((a) => a.startsWith('--canv-screenshot-seed-legacy='))
    const seedLegacy = seedLegacyArg ? seedLegacyArg.slice('--canv-screenshot-seed-legacy='.length) : ''
    if (seedLegacy === '1') {
      try {
        // Write the three keys that legacyStateExists() checks. Absence of
        // canv:schemaVersion (or any value other than '2') is also required —
        // do not set it so the migration check passes.
        localStorage.setItem('canv:document', '<p>A legacy document.</p>')
        localStorage.setItem('canv:title', 'My Old Document')
        localStorage.setItem('canv:contextFiles', '[]')
        // Ensure schemaVersion is not '2' (remove any stale value).
        localStorage.removeItem('canv:schemaVersion')
      } catch { /* silently ignore */ }
    }

    // Seed canv:runs with a pre-built array of RunRecord fixtures so screenshot
    // captures can show the results panel without a live API call.
    const seedRunsArg = process.argv.find((a) => a.startsWith('--canv-screenshot-seed-runs='))
    const seedRunsB64 = seedRunsArg ? seedRunsArg.slice('--canv-screenshot-seed-runs='.length) : ''
    if (seedRunsB64) {
      try {
        const json = Buffer.from(seedRunsB64, 'base64').toString('utf8')
        // Validate before writing; useLocalStorage reads this as JSON.
        JSON.parse(json)
        localStorage.setItem('canv:runs', json)
        // Also make the results panel visible. useIdeLayout persists layout:bottom
        // under a workspace-specific key: canv:ws:<djb2(root)>:layout:bottom.
        // We compute the same hash here so the panel is open on first mount.
        if (ws) {
          function djb2(s) {
            let h = 5381
            for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
            return (h >>> 0).toString(36)
          }
          const layoutKey = `canv:ws:${djb2(ws)}:layout:bottom`
          const existing = (() => {
            try { const r = localStorage.getItem(layoutKey); return r ? JSON.parse(r) : {} } catch { return {} }
          })()
          const bottomLayout = {
            visible: true,
            activeTab: 'runs',
            size: 35,
            rightSize: 30,
            placement: 'bottom',
            lastDockedPlacement: 'bottom',
            ...(existing.value ?? {}),
          }
          localStorage.setItem(layoutKey, JSON.stringify({ value: bottomLayout }))
        }
      } catch {}
    }
  } catch {
    // Silently ignore — never block normal app startup.
  }
})()

if (!isDockPopout()) {
  // Main-window-only APIs.
  contextBridge.exposeInMainWorld('canvFS', {
    pickWorkspace: () => ipcRenderer.invoke('canvFS:pickWorkspace'),
    setWorkspace: (root) => ipcRenderer.invoke('canvFS:setWorkspace', root),
    getWorkspace: () => ipcRenderer.invoke('canvFS:getWorkspace'),
    listDir: (rel) => ipcRenderer.invoke('canvFS:listDir', rel ?? ''),
    readFile: (rel) => ipcRenderer.invoke('canvFS:readFile', rel),
    writeFile: (rel, content, expectedMtimeMs, opts) =>
      ipcRenderer.invoke('canvFS:writeFile', rel, content, expectedMtimeMs, opts),
    applyEdits: (fileWrites) => ipcRenderer.invoke('canvFS:applyEdits', fileWrites),
    createFile: (rel, content) => ipcRenderer.invoke('canvFS:createFile', rel, content ?? ''),
    createFolder: (rel) => ipcRenderer.invoke('canvFS:createFolder', rel),
    rename: (oldRel, newRel) => ipcRenderer.invoke('canvFS:rename', oldRel, newRel),
    delete: (rel) => ipcRenderer.invoke('canvFS:delete', rel),
    search: (query) => ipcRenderer.invoke('canvFS:search', query),
    gitStatus: () => ipcRenderer.invoke('canvFS:gitStatus'),
    gitDiff: (rel, baseRef) => ipcRenderer.invoke('canvFS:gitDiff', rel, baseRef ?? 'HEAD'),
    readWorkspaceConfig: () => ipcRenderer.invoke('canvFS:readWorkspaceConfig'),
    writeWorkspaceConfig: (cfg) => ipcRenderer.invoke('canvFS:writeWorkspaceConfig', cfg),
    subscribe: (cb) => {
      const listener = (_e, payload) => {
        try { cb(payload) } catch { /* ignore subscriber errors */ }
      }
      ipcRenderer.on('canvFS:event', listener)
      return () => ipcRenderer.removeListener('canvFS:event', listener)
    },
    openRemote: (raw) => ipcRenderer.invoke('canvFS:openRemote', raw),
    listRecentRemotes: () => ipcRenderer.invoke('canvFS:listRecentRemotes'),
    closeWorkspace: () => ipcRenderer.invoke('canvFS:closeWorkspace'),
    getWorkspaceKind: () => ipcRenderer.invoke('canvFS:getWorkspaceKind'),
    reconnect: () => ipcRenderer.invoke('canvFS:reconnect'),
    onStatus: (cb) => {
      const listener = (_e, payload) => { try { cb(payload) } catch { /* ignore subscriber errors */ } }
      ipcRenderer.on('canvFS:status', listener)
      return () => ipcRenderer.removeListener('canvFS:status', listener)
    },
  })

  contextBridge.exposeInMainWorld('canvConfig', {
    list: () => ipcRenderer.invoke('canvConfig:list'),
    revealFolder: () => ipcRenderer.invoke('canvConfig:revealFolder'),
    factoryReset: () => ipcRenderer.invoke('canvConfig:factoryReset'),
  })

  contextBridge.exposeInMainWorld('canvServe', {
    start: (absRoot) => ipcRenderer.invoke('canvServe:start', absRoot),
    stop: () => ipcRenderer.invoke('canvServe:stop'),
    status: () => ipcRenderer.invoke('canvServe:status'),
    onStatusChanged: (cb) => {
      const listener = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
      ipcRenderer.on('canvServe:statusChanged', listener)
      return () => ipcRenderer.removeListener('canvServe:statusChanged', listener)
    },
  })

  contextBridge.exposeInMainWorld('canvSites', {
    list: () => ipcRenderer.invoke('canvSites:list'),
    listWithStaleness: () => ipcRenderer.invoke('canvSites:listWithStaleness'),
    register: (input) => ipcRenderer.invoke('canvSites:register', input),
    update: (id, patch) => ipcRenderer.invoke('canvSites:update', id, patch),
    open: (id) => ipcRenderer.invoke('canvSites:open', id),
    delete: (id) => ipcRenderer.invoke('canvSites:delete', id),
    setPinned: (id, pinned) => ipcRenderer.invoke('canvSites:setPinned', id, pinned),
    onRegistryChanged: (cb) => {
      const listener = () => cb()
      ipcRenderer.on('canvSites:registryChanged', listener)
      return () => ipcRenderer.removeListener('canvSites:registryChanged', listener)
    },
  })

  contextBridge.exposeInMainWorld('canvExtensions', {
    listInstalled:         () => ipcRenderer.invoke('canvExtensions:listInstalled'),
    readAllContributions:  () => ipcRenderer.invoke('canvExtensions:readAllContributions'),
    install:           (folder) => ipcRenderer.invoke('canvExtensions:install', folder),
    uninstall:         (id) => ipcRenderer.invoke('canvExtensions:uninstall', id),
    setEnabled:        (id, en) => ipcRenderer.invoke('canvExtensions:setEnabled', id, en),
    setTrustedAt:      (id, iso) => ipcRenderer.invoke('canvExtensions:setTrustedAt', id, iso),
    getWorkspaceTrust: () => ipcRenderer.invoke('canvExtensions:getWorkspaceTrust'),
    setWorkspaceTrust: (s) => ipcRenderer.invoke('canvExtensions:setWorkspaceTrust', s),
    readSettings:      (id) => ipcRenderer.invoke('canvExtensions:readSettings', id),
    writeSetting:      (id, key, value) => ipcRenderer.invoke('canvExtensions:writeSetting', id, key, value),
    readManifest:      (id) => ipcRenderer.invoke('canvExtensions:readManifest', id),
    listFiles:         (id) => ipcRenderer.invoke('canvExtensions:listFiles', id),
    readFile:          (id, rel) => ipcRenderer.invoke('canvExtensions:readFile', id, rel),
    reload:            (id) => ipcRenderer.invoke('canvExtensions:reload', id),
    pickInstallFolder: () => ipcRenderer.invoke('canvExtensions:pickInstallFolder'),
    pickInstallFile:   () => ipcRenderer.invoke('canvExtensions:pickInstallFile'),
    previewInstall:    (source) => ipcRenderer.invoke('canvExtensions:previewInstall', source),
    requestActivation: (trigger) => ipcRenderer.invoke('canvExtensions:requestActivation', trigger),
    readActivity: (id) => ipcRenderer.invoke('canvExtensions:readActivity', id),
    showPanelInSlot: (slotId, bounds) => ipcRenderer.invoke('canvExtensions:showPanelInSlot', slotId, bounds),
    hidePanelInSlot: (slotId) => ipcRenderer.invoke('canvExtensions:hidePanelInSlot', slotId),
    showFileInExtension: (extensionId, relPath, mode, bounds) => ipcRenderer.invoke('canvExtensions:showFileInExtension', extensionId, relPath, mode, bounds),
    hideFileInExtension: (extensionId, relPath) => ipcRenderer.invoke('canvExtensions:hideFileInExtension', extensionId, relPath),
    onChanged: (cb) => {
      const listener = () => { try { cb() } catch { /* ignore */ } }
      ipcRenderer.on('canvExtensions:registryChanged', listener)
      return () => ipcRenderer.removeListener('canvExtensions:registryChanged', listener)
    },
    onCrashed: (cb) => {
      const listener = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
      ipcRenderer.on('canvExtensions:crashed', listener)
      return () => ipcRenderer.removeListener('canvExtensions:crashed', listener)
    },
    onEngineMismatch: (cb) => {
      const listener = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
      ipcRenderer.on('canvExtensions:engineMismatch', listener)
      return () => ipcRenderer.removeListener('canvExtensions:engineMismatch', listener)
    },
    devCrash: (id) => ipcRenderer.invoke('canvExtensions:devCrash', id),
    onPromptRequest: (cb) => {
      const listener = (_e, reqId, req) => { try { cb(reqId, req) } catch { /* ignore */ } }
      ipcRenderer.on('canvExtensions:promptRequest', listener)
      return () => ipcRenderer.removeListener('canvExtensions:promptRequest', listener)
    },
    promptResolve: (reqId, value) => ipcRenderer.send('canvExtensions:promptResolve', reqId, value),
    onStatusBarChanged: (cb) => {
      const listener = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
      ipcRenderer.on('canvExtensions:statusBarChanged', listener)
      return () => ipcRenderer.removeListener('canvExtensions:statusBarChanged', listener)
    },
    invokeCommand: (commandId, args) => ipcRenderer.invoke('canvExtensions:invokeCommand', commandId, args),
    getFileHandlerDefaults: () => ipcRenderer.invoke('canvExtensions:getFileHandlerDefaults'),
    setFileHandlerDefault: (ext, extensionId) => ipcRenderer.invoke('canvExtensions:setFileHandlerDefault', ext, extensionId),
  })

  contextBridge.exposeInMainWorld('canvMcp', {
    setServers: (cfgs) => ipcRenderer.invoke('canvMcp:setServers', cfgs),
    listTools:  () => ipcRenderer.invoke('canvMcp:listTools'),
    callTool:   (name, args) => ipcRenderer.invoke('canvMcp:callTool', name, args),
    reconnect:  () => ipcRenderer.invoke('canvMcp:reconnect'),
    testServer:      (name) => ipcRenderer.invoke('canvMcp:testServer', name),
    reconnectServer: (name) => ipcRenderer.invoke('canvMcp:reconnectServer', name),
  })

  contextBridge.exposeInMainWorld('canvExtensionsDev', {
    spawnTest:   (fixtureName, bounds) => ipcRenderer.invoke('canvExtDev:spawnTest', fixtureName, bounds),
    destroyTest: (id) => ipcRenderer.invoke('canvExtDev:destroyTest', id),
    setBounds:   (id, bounds) => ipcRenderer.invoke('canvExtDev:setBounds', id, bounds),
    onNotification: (cb) => {
      const listener = (_e, payload) => { try { cb(payload) } catch { /* ignore */ } }
      ipcRenderer.on('canvExt:notification', listener)
      return () => ipcRenderer.removeListener('canvExt:notification', listener)
    },
    // Main → main-window: extension host RPC. Main asks main-window for editor
    // state (active doc text, selection, etc.). The renderer answers via
    // `canvExtHost:reply`. Wired up in the TestExtensionOverlay (Task 18).
    onHostRequest: (cb) => {
      const listener = (_e, reqId, method, args) => { try { cb(reqId, method, args) } catch { /* ignore */ } }
      ipcRenderer.on('canvExtHost:request', listener)
      return () => ipcRenderer.removeListener('canvExtHost:request', listener)
    },
    hostReply: (reqId, ok, payload) => ipcRenderer.send('canvExtHost:reply', reqId, ok, payload),
    // Main-window pushes events (e.g. activeDocChanged) into the runtime so
    // every subscribed extension receives them.
    fireEvent: (type, payload) => ipcRenderer.invoke('canvExtDev:fireEvent', type, payload),
  })

}

// Available in both main and pop-out windows.
// canvHistory is exposed here (outside the gate) so the pop-out window can make
// read-only file-history IPC calls when FileHistoryTab is visible in a popout.
contextBridge.exposeInMainWorld('canvHistory', {
  init: () => ipcRenderer.invoke('canvHistory:init'),
  createSnapshot: (input) => ipcRenderer.invoke('canvHistory:createSnapshot', input),
  listSnapshots: (opts) => ipcRenderer.invoke('canvHistory:listSnapshots', opts ?? {}),
  getSnapshot: (id) => ipcRenderer.invoke('canvHistory:getSnapshot', id),
  getSnapshotByCommit: (sha) => ipcRenderer.invoke('canvHistory:getSnapshotByCommit', sha),
  diffSnapshot: (id, rel) => ipcRenderer.invoke('canvHistory:diffSnapshot', id, rel),
  diffCurrent: (rel) => ipcRenderer.invoke('canvHistory:diffCurrent', rel ?? null),
  getCurrentChanges: () => ipcRenderer.invoke('canvHistory:getCurrentChanges'),
  restoreFilePreview: (id, rel) => ipcRenderer.invoke('canvHistory:restoreFilePreview', id, rel),
  restoreFile: (id, rel) => ipcRenderer.invoke('canvHistory:restoreFile', id, rel),
  hideSnapshot: (id) => ipcRenderer.invoke('canvHistory:hideSnapshot', id),
  patchSnapshotFiles: (id, files) => ipcRenderer.invoke('canvHistory:patchSnapshotFiles', id, files),
  getTipCommit: () => ipcRenderer.invoke('canvHistory:getTipCommit'),
  getSnapshotDelta: (id) => ipcRenderer.invoke('canvHistory:getSnapshotDelta', id),
  getFileHistory: (rel) => ipcRenderer.invoke('canvHistory:getFileHistory', rel),
})

contextBridge.exposeInMainWorld('canvDock', {
  // main → main IPC: ask main process to open/close the popout window
  openPopout: () => ipcRenderer.invoke('canvDock:openPopout'),
  closePopout: () => ipcRenderer.invoke('canvDock:closePopout'),

  // main → popout: broadcast state via main process relay
  pushState: (state) => ipcRenderer.send('canvDock:state', state),
  onUserAction: (cb) => {
    const listener = (_e, action) => { try { cb(action) } catch { /* swallow */ } }
    ipcRenderer.on('canvDock:userAction', listener)
    return () => ipcRenderer.removeListener('canvDock:userAction', listener)
  },
  onPopoutClosed: (cb) => {
    const listener = () => { try { cb() } catch { /* swallow */ } }
    ipcRenderer.on('canvDock:popoutClosed', listener)
    return () => ipcRenderer.removeListener('canvDock:popoutClosed', listener)
  },
  onPopoutReady: (cb) => {
    const listener = () => { try { cb() } catch { /* swallow */ } }
    ipcRenderer.on('canvDock:popoutReady', listener)
    return () => ipcRenderer.removeListener('canvDock:popoutReady', listener)
  },

  // popout → main: subscribe to snapshots
  onState: (cb) => {
    const listener = (_e, state) => { try { cb(state) } catch { /* swallow */ } }
    ipcRenderer.on('canvDock:state', listener)
    return () => ipcRenderer.removeListener('canvDock:state', listener)
  },
  sendAction: (action) => ipcRenderer.send('canvDock:userAction', action),
  ready: () => ipcRenderer.send('canvDock:ready'),
})
