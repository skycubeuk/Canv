'use strict'

const { BrowserWindow, app, nativeTheme } = require('electron')
const path = require('node:path')

/**
 * dock IPC handlers. Called once at app.whenReady from electron/main.cjs.
 *
 * Owns the pop-out window lifecycle (BrowserWindow creation, close handling,
 * relay channels between main renderer and pop-out renderer). The pop-out can
 * host extension WebContentsViews that were reparented out of the main
 * window's bottom dock; on close we destroy those views so the next mount in
 * the main window spawns fresh via the normal showPanelInSlot path.
 *
 * `popoutWindow` is module-scoped state in main.cjs and surfaced via
 * `deps.getPopoutWindow()` / `deps.setPopoutWindow(w)`.
 */
function registerIpcHandlers(ipcMain, deps) {
  const {
    getMainWindow,
    getPopoutWindow,
    setPopoutWindow,
    getExtensionRuntime,
    configureWindowOpenHandler,
    APP_ICON,
    DEV_URL,
  } = deps

  function broadcastToMainWindow(channel, payload) {
    const w = getMainWindow()
    if (w && !w.isDestroyed()) {
      w.webContents.send(channel, payload)
    }
  }

  function broadcastToPopout(channel, payload) {
    const w = getPopoutWindow()
    if (w && !w.isDestroyed()) {
      w.webContents.send(channel, payload)
    }
  }

  ipcMain.handle('canvDock:openPopout', async () => {
    const existing = getPopoutWindow()
    if (existing && !existing.isDestroyed()) {
      existing.focus()
      return
    }
    const win = new BrowserWindow({
      width: 600,
      height: 800,
      minWidth: 360,
      minHeight: 320,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#171717' : '#fafaf9',
      title: 'Canv Dock',
      icon: APP_ICON,
      webPreferences: {
        preload: path.join(__dirname, '..', '..', 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    setPopoutWindow(win)
    configureWindowOpenHandler(win)

    if (app.isPackaged) {
      const indexPath = path.join(__dirname, '..', '..', '..', 'dist', 'index.html')
      await win.loadFile(indexPath, { search: 'mode=dock' })
    } else {
      await win.loadURL(`${DEV_URL}?mode=dock`)
    }

    win.on('closed', () => {
      // Tear down any extension WebContentsViews that were reparented into the
      // pop-out. The next mount in main triggers a fresh spawn via the normal
      // showPanelInSlot path — simpler than reparenting back to main here,
      // and avoids guessing bounds when the main-window slot isn't mounted.
      const runtime = getExtensionRuntime()
      if (runtime) {
        const hosted = runtime.idsHostedBy(win)
        for (const id of hosted) {
          try { runtime.destroy(id, { reason: 'host-window-closed' }) } catch { /* ignore */ }
        }
      }
      if (getPopoutWindow() === win) setPopoutWindow(null)
      broadcastToMainWindow('canvDock:popoutClosed')
    })
  })

  ipcMain.handle('canvDock:closePopout', async () => {
    const w = getPopoutWindow()
    if (w && !w.isDestroyed()) {
      w.destroy()
    }
    setPopoutWindow(null)
  })

  // Relay: main renderer pushes state → forward to popout.
  ipcMain.on('canvDock:state', (_e, state) => {
    broadcastToPopout('canvDock:state', state)
  })

  // Relay: popout sends user action → forward to main renderer.
  ipcMain.on('canvDock:userAction', (_e, action) => {
    broadcastToMainWindow('canvDock:userAction', action)
  })

  // Relay: popout signals ready → tell main renderer so it can push an immediate snapshot.
  ipcMain.on('canvDock:ready', () => {
    broadcastToMainWindow('canvDock:popoutReady')
  })
}

module.exports = { registerIpcHandlers }
