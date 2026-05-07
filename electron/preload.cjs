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
    writeFile: (rel, content, expectedMtimeMs) =>
      ipcRenderer.invoke('canvFS:writeFile', rel, content, expectedMtimeMs),
    createFile: (rel, content) => ipcRenderer.invoke('canvFS:createFile', rel, content ?? ''),
    createFolder: (rel) => ipcRenderer.invoke('canvFS:createFolder', rel),
    rename: (oldRel, newRel) => ipcRenderer.invoke('canvFS:rename', oldRel, newRel),
    delete: (rel) => ipcRenderer.invoke('canvFS:delete', rel),
    search: (query) => ipcRenderer.invoke('canvFS:search', query),
    gitStatus: () => ipcRenderer.invoke('canvFS:gitStatus'),
    gitDiff: (rel, baseRef) => ipcRenderer.invoke('canvFS:gitDiff', rel, baseRef ?? 'HEAD'),
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
}

// Available in both main and pop-out windows.
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
