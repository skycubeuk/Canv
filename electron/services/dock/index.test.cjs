'use strict'
// describe/it/expect/beforeEach/afterEach/vi are injected by vitest globals.
//
// Integration tests for the dock service IPC handlers
// (electron/services/dock/index.cjs). Mirrors the per-file template
// established in electron/services/fs/index.test.cjs.
//
// The dock service:
//   - Constructs a real `BrowserWindow` on canvDock:openPopout — we stub the
//     BrowserWindow class on the electron mock so no actual native window is
//     created.
//   - Registers three `ipcMain.on` relays that broadcast between the main
//     window and the popout window. Tests drive these via the
//     makeIpcMain().emit(name, ...) seam.
//   - Stores the popout via deps.setPopoutWindow / reads via getPopoutWindow.
//   - Calls `getExtensionRuntime().idsHostedBy(win)` + `destroy()` on close.

const Module = require('node:module')
const os = require('node:os')

// ---------------------------------------------------------------------------
// Build a stub BrowserWindow class on the electron mock. The dock service
// passes the constructed window to deps.setPopoutWindow + reads it back. We
// give the stub all surfaces the service touches.
// ---------------------------------------------------------------------------
class FakeWindow {
  constructor(opts) {
    this.opts = opts
    this.destroyed = false
    this._closedHandlers = []
    this.webContents = { send: vi.fn() }
    this.focus = vi.fn()
    this.loadFile = vi.fn().mockResolvedValue(undefined)
    this.loadURL = vi.fn().mockResolvedValue(undefined)
  }
  isDestroyed() { return this.destroyed }
  destroy() {
    this.destroyed = true
    // Real BrowserWindow fires 'closed' on destroy. Mirror that for the
    // service's tear-down path.
    for (const fn of this._closedHandlers) fn()
  }
  on(event, fn) {
    if (event === 'closed') this._closedHandlers.push(fn)
  }
}

const electronPath = require.resolve('electron')
const electron = {
  app: { getPath: () => os.tmpdir(), isPackaged: false },
  shell: { openExternal: async () => undefined },
  BrowserWindow: FakeWindow,
  nativeTheme: { shouldUseDarkColors: false },
}
{
  const m = new Module(electronPath)
  m.filename = electronPath
  m.loaded = true
  m.exports = electron
  require.cache[electronPath] = m
}

const svc = require('./index.cjs')

function makeIpcMain() {
  const handlers = new Map()
  const onListeners = new Map()
  return {
    handle(name, fn) { handlers.set(name, fn) },
    async invoke(name, ...args) {
      const fn = handlers.get(name)
      if (!fn) throw new Error(`no handler: ${name}`)
      return fn({}, ...args)
    },
    on(name, fn) {
      const arr = onListeners.get(name) ?? []
      arr.push(fn)
      onListeners.set(name, arr)
    },
    emit(name, ...args) {
      const arr = onListeners.get(name) ?? []
      for (const fn of arr) fn({}, ...args)
    },
    removeHandler() {},
    _hasListener(name) { return (onListeners.get(name) ?? []).length > 0 },
  }
}

function makeDeps(overrides = {}) {
  const state = {
    mainWindow: new FakeWindow({}),
    popout: null,
  }
  const deps = {
    getMainWindow: () => state.mainWindow,
    getPopoutWindow: () => state.popout,
    setPopoutWindow: vi.fn((w) => { state.popout = w }),
    getExtensionRuntime: () => null,
    configureWindowOpenHandler: vi.fn(),
    APP_ICON: '/some/icon.png',
    DEV_URL: 'http://localhost:5173',
    ...overrides,
  }
  return { deps, state }
}

describe('dock service IPC handlers', () => {
  let ipcMain, deps, state

  beforeEach(() => {
    ipcMain = makeIpcMain()
    ;({ deps, state } = makeDeps())
    svc.registerIpcHandlers(ipcMain, deps)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // canvDock:openPopout
  // -------------------------------------------------------------------------

  describe('canvDock:openPopout', () => {
    it('happy: constructs a BrowserWindow, sets popout, configures handler, loads URL', async () => {
      await ipcMain.invoke('canvDock:openPopout')
      expect(state.popout).toBeInstanceOf(FakeWindow)
      expect(deps.setPopoutWindow).toHaveBeenCalledWith(state.popout)
      expect(deps.configureWindowOpenHandler).toHaveBeenCalledWith(state.popout)
      // Dev mode (app.isPackaged === false) → loadURL with mode=dock query.
      expect(state.popout.loadURL).toHaveBeenCalledWith('http://localhost:5173?mode=dock')
      expect(state.popout.loadFile).not.toHaveBeenCalled()
    })

    it('packaged: loads from dist/index.html with mode=dock search', async () => {
      electron.app.isPackaged = true
      try {
        await ipcMain.invoke('canvDock:openPopout')
        expect(state.popout.loadFile).toHaveBeenCalledTimes(1)
        const args = state.popout.loadFile.mock.calls[0]
        expect(args[0]).toMatch(/dist[\\/]+index\.html$/)
        expect(args[1]).toEqual({ search: 'mode=dock' })
      } finally {
        electron.app.isPackaged = false
      }
    })

    it('no-op: already-open popout is focused and not replaced', async () => {
      const existing = new FakeWindow({})
      state.popout = existing
      await ipcMain.invoke('canvDock:openPopout')
      expect(existing.focus).toHaveBeenCalledTimes(1)
      expect(deps.setPopoutWindow).not.toHaveBeenCalled()
      // The stored popout is still the same instance.
      expect(state.popout).toBe(existing)
    })

    it('close: destroying the popout fires the closed handler, clears state, notifies main', async () => {
      await ipcMain.invoke('canvDock:openPopout')
      const popout = state.popout
      // Trigger the closed handler by destroying the fake window.
      popout.destroy()
      // setPopoutWindow(null) called from the closed handler.
      expect(deps.setPopoutWindow).toHaveBeenLastCalledWith(null)
      expect(state.popout).toBeNull()
      // Main window notified.
      expect(state.mainWindow.webContents.send).toHaveBeenCalledWith('canvDock:popoutClosed', undefined)
    })

    it('close: tears down hosted extensions via runtime.destroy', async () => {
      const runtime = {
        idsHostedBy: vi.fn(() => ['ext-a', 'ext-b']),
        destroy: vi.fn(),
      }
      const ipc2 = makeIpcMain()
      const { deps: deps2, state: state2 } = makeDeps({ getExtensionRuntime: () => runtime })
      svc.registerIpcHandlers(ipc2, deps2)
      await ipc2.invoke('canvDock:openPopout')
      const popout = state2.popout
      popout.destroy()
      expect(runtime.idsHostedBy).toHaveBeenCalledWith(popout)
      expect(runtime.destroy).toHaveBeenCalledTimes(2)
      expect(runtime.destroy).toHaveBeenCalledWith('ext-a', { reason: 'host-window-closed' })
      expect(runtime.destroy).toHaveBeenCalledWith('ext-b', { reason: 'host-window-closed' })
    })
  })

  // -------------------------------------------------------------------------
  // canvDock:closePopout
  // -------------------------------------------------------------------------

  describe('canvDock:closePopout', () => {
    it('happy: destroys the live popout window and clears state', async () => {
      const popout = new FakeWindow({})
      state.popout = popout
      await ipcMain.invoke('canvDock:closePopout')
      expect(popout.destroyed).toBe(true)
      // closed-listener attached in openPopout would clear state via
      // setPopoutWindow(null). When called directly via closePopout (no prior
      // openPopout in this test) the service calls setPopoutWindow(null)
      // unconditionally at the end.
      expect(deps.setPopoutWindow).toHaveBeenLastCalledWith(null)
    })

    it('no-op: no live popout → setPopoutWindow(null) is called, no error', async () => {
      state.popout = null
      await ipcMain.invoke('canvDock:closePopout')
      expect(deps.setPopoutWindow).toHaveBeenCalledWith(null)
    })

    it('no-op: destroyed popout is not destroyed again', async () => {
      const popout = new FakeWindow({})
      popout.destroyed = true
      const destroySpy = vi.spyOn(popout, 'destroy')
      state.popout = popout
      await ipcMain.invoke('canvDock:closePopout')
      expect(destroySpy).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // ipcMain.on relays
  // -------------------------------------------------------------------------

  describe('canvDock:state listener', () => {
    it('happy: registered listener forwards payload to the popout window', () => {
      expect(ipcMain._hasListener('canvDock:state')).toBe(true)
      const popout = new FakeWindow({})
      state.popout = popout
      ipcMain.emit('canvDock:state', { panel: 'A', open: true })
      expect(popout.webContents.send).toHaveBeenCalledWith('canvDock:state', { panel: 'A', open: true })
    })

    it('no-op: no popout → emit does not throw', () => {
      state.popout = null
      expect(() => ipcMain.emit('canvDock:state', { x: 1 })).not.toThrow()
    })
  })

  describe('canvDock:userAction listener', () => {
    it('happy: registered listener forwards action to the main window', () => {
      expect(ipcMain._hasListener('canvDock:userAction')).toBe(true)
      ipcMain.emit('canvDock:userAction', { type: 'click', id: 'x' })
      expect(state.mainWindow.webContents.send).toHaveBeenCalledWith('canvDock:userAction', { type: 'click', id: 'x' })
    })

    it('no-op: destroyed main window → no send', () => {
      state.mainWindow.destroyed = true
      ipcMain.emit('canvDock:userAction', { type: 'x' })
      expect(state.mainWindow.webContents.send).not.toHaveBeenCalled()
    })
  })

  describe('canvDock:ready listener', () => {
    it('happy: registered listener notifies main with canvDock:popoutReady', () => {
      expect(ipcMain._hasListener('canvDock:ready')).toBe(true)
      ipcMain.emit('canvDock:ready')
      expect(state.mainWindow.webContents.send).toHaveBeenCalledWith('canvDock:popoutReady', undefined)
    })

    it('idempotent: firing ready twice notifies main twice', () => {
      ipcMain.emit('canvDock:ready')
      ipcMain.emit('canvDock:ready')
      expect(state.mainWindow.webContents.send).toHaveBeenCalledTimes(2)
    })
  })
})
