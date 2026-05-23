'use strict'
// describe/it/expect/beforeEach/afterEach/vi are injected by vitest globals.
//
// Integration tests for the history service IPC handlers
// (electron/services/history/index.cjs). The service is a thin router: every
// handler delegates to a method on the singleton returned by
// `deps.getHistoryService()`. Tests inject a stub history service made of
// vi.fn()s and assert the routing — happy path returns the canned value, error
// path lets the rejection propagate.

const Module = require('node:module')
const os = require('node:os')

// ---------------------------------------------------------------------------
// Electron stub. The history service module itself does not import 'electron',
// but loading the service triggers shared module imports that touch the cache.
// Keep the stub minimal.
// ---------------------------------------------------------------------------
const electronPath = require.resolve('electron')
const electron = {
  app: { getPath: () => os.tmpdir() },
  BrowserWindow: class {},
  nativeTheme: {},
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
  }
}

function makeHistoryStub() {
  return {
    initRevisionArchaeology: vi.fn(),
    createSnapshot: vi.fn(),
    listSnapshots: vi.fn(),
    getSnapshot: vi.fn(),
    getSnapshotByCommit: vi.fn(),
    diffSnapshot: vi.fn(),
    diffCurrent: vi.fn(),
    getCurrentChanges: vi.fn(),
    restoreFilePreview: vi.fn(),
    restoreFile: vi.fn(),
    hideSnapshot: vi.fn(),
    patchSnapshotFiles: vi.fn(),
    getTipCommit: vi.fn(),
    getSnapshotDelta: vi.fn(),
    getFileHistory: vi.fn(),
  }
}

describe('history service IPC handlers', () => {
  let ipcMain, history

  beforeEach(() => {
    ipcMain = makeIpcMain()
    history = makeHistoryStub()
    svc.registerIpcHandlers(ipcMain, { getHistoryService: () => history })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Every handler follows the same shape. The helper pair below makes the
  // happy + error tests one-liners per handler.
  function expectRoutes({ channel, method, args = [], result }) {
    return async () => {
      history[method].mockResolvedValue(result)
      const r = await ipcMain.invoke(channel, ...args)
      expect(history[method]).toHaveBeenCalledTimes(1)
      expect(history[method]).toHaveBeenCalledWith(...args)
      expect(r).toEqual(result)
    }
  }
  function expectPropagates({ channel, method, args = [], message }) {
    return async () => {
      history[method].mockRejectedValue(new Error(message))
      await expect(ipcMain.invoke(channel, ...args)).rejects.toThrow(new RegExp(message))
    }
  }

  // -------------------------------------------------------------------------
  // canvHistory:init
  // -------------------------------------------------------------------------
  describe('canvHistory:init', () => {
    it('happy: routes to initRevisionArchaeology', expectRoutes({
      channel: 'canvHistory:init',
      method: 'initRevisionArchaeology',
      result: { branch: 'canv-history', headCommit: 'abc' },
    }))
    it('error: propagates initRevisionArchaeology failure', expectPropagates({
      channel: 'canvHistory:init',
      method: 'initRevisionArchaeology',
      message: 'init failed',
    }))
  })

  // -------------------------------------------------------------------------
  // canvHistory:createSnapshot
  // -------------------------------------------------------------------------
  describe('canvHistory:createSnapshot', () => {
    it('happy: routes to createSnapshot with input', expectRoutes({
      channel: 'canvHistory:createSnapshot',
      method: 'createSnapshot',
      args: [{ label: 'before edit' }],
      result: { id: 's1', commit: 'sha1' },
    }))
    it('error: propagates createSnapshot failure', expectPropagates({
      channel: 'canvHistory:createSnapshot',
      method: 'createSnapshot',
      args: [{ label: 'x' }],
      message: 'snapshot failed',
    }))
  })

  // -------------------------------------------------------------------------
  // canvHistory:listSnapshots
  // -------------------------------------------------------------------------
  describe('canvHistory:listSnapshots', () => {
    it('happy: routes to listSnapshots with opts', expectRoutes({
      channel: 'canvHistory:listSnapshots',
      method: 'listSnapshots',
      args: [{ limit: 50 }],
      result: [{ id: 's1' }, { id: 's2' }],
    }))
    it('error: propagates listSnapshots failure', expectPropagates({
      channel: 'canvHistory:listSnapshots',
      method: 'listSnapshots',
      args: [{}],
      message: 'list failed',
    }))
  })

  // -------------------------------------------------------------------------
  // canvHistory:getSnapshot
  // -------------------------------------------------------------------------
  describe('canvHistory:getSnapshot', () => {
    it('happy: routes to getSnapshot(id)', expectRoutes({
      channel: 'canvHistory:getSnapshot',
      method: 'getSnapshot',
      args: ['s1'],
      result: { id: 's1', label: 'one' },
    }))
    it('error: propagates getSnapshot failure', expectPropagates({
      channel: 'canvHistory:getSnapshot',
      method: 'getSnapshot',
      args: ['s1'],
      message: 'get failed',
    }))
  })

  // -------------------------------------------------------------------------
  // canvHistory:getSnapshotByCommit
  // -------------------------------------------------------------------------
  describe('canvHistory:getSnapshotByCommit', () => {
    it('happy: routes to getSnapshotByCommit(sha)', expectRoutes({
      channel: 'canvHistory:getSnapshotByCommit',
      method: 'getSnapshotByCommit',
      args: ['deadbeef'],
      result: { id: 's1', commit: 'deadbeef' },
    }))
    it('error: propagates getSnapshotByCommit failure', expectPropagates({
      channel: 'canvHistory:getSnapshotByCommit',
      method: 'getSnapshotByCommit',
      args: ['xxx'],
      message: 'commit lookup failed',
    }))
  })

  // -------------------------------------------------------------------------
  // canvHistory:diffSnapshot
  // -------------------------------------------------------------------------
  describe('canvHistory:diffSnapshot', () => {
    it('happy: routes to diffSnapshot(id, rel)', expectRoutes({
      channel: 'canvHistory:diffSnapshot',
      method: 'diffSnapshot',
      args: ['s1', 'a.md'],
      result: { hunks: [] },
    }))
    it('error: propagates diffSnapshot failure', expectPropagates({
      channel: 'canvHistory:diffSnapshot',
      method: 'diffSnapshot',
      args: ['s1', 'a.md'],
      message: 'diff failed',
    }))
  })

  // -------------------------------------------------------------------------
  // canvHistory:diffCurrent
  // -------------------------------------------------------------------------
  describe('canvHistory:diffCurrent', () => {
    it('happy: routes to diffCurrent(rel)', expectRoutes({
      channel: 'canvHistory:diffCurrent',
      method: 'diffCurrent',
      args: ['a.md'],
      result: { hunks: [{ from: 0, to: 1 }] },
    }))
    it('error: propagates diffCurrent failure', expectPropagates({
      channel: 'canvHistory:diffCurrent',
      method: 'diffCurrent',
      args: ['a.md'],
      message: 'diffCurrent failed',
    }))
  })

  // -------------------------------------------------------------------------
  // canvHistory:getCurrentChanges
  // -------------------------------------------------------------------------
  describe('canvHistory:getCurrentChanges', () => {
    it('happy: routes to getCurrentChanges()', expectRoutes({
      channel: 'canvHistory:getCurrentChanges',
      method: 'getCurrentChanges',
      result: { changedFiles: ['a.md'] },
    }))
    it('error: propagates getCurrentChanges failure', expectPropagates({
      channel: 'canvHistory:getCurrentChanges',
      method: 'getCurrentChanges',
      message: 'changes failed',
    }))
  })

  // -------------------------------------------------------------------------
  // canvHistory:restoreFilePreview
  // -------------------------------------------------------------------------
  describe('canvHistory:restoreFilePreview', () => {
    it('happy: routes to restoreFilePreview(id, rel)', expectRoutes({
      channel: 'canvHistory:restoreFilePreview',
      method: 'restoreFilePreview',
      args: ['s1', 'a.md'],
      result: { content: 'preview' },
    }))
    it('error: propagates restoreFilePreview failure', expectPropagates({
      channel: 'canvHistory:restoreFilePreview',
      method: 'restoreFilePreview',
      args: ['s1', 'a.md'],
      message: 'preview failed',
    }))
  })

  // -------------------------------------------------------------------------
  // canvHistory:restoreFile
  // -------------------------------------------------------------------------
  describe('canvHistory:restoreFile', () => {
    it('happy: routes to restoreFile(id, rel)', expectRoutes({
      channel: 'canvHistory:restoreFile',
      method: 'restoreFile',
      args: ['s1', 'a.md'],
      result: { ok: true },
    }))
    it('error: propagates restoreFile failure', expectPropagates({
      channel: 'canvHistory:restoreFile',
      method: 'restoreFile',
      args: ['s1', 'a.md'],
      message: 'restore failed',
    }))
  })

  // -------------------------------------------------------------------------
  // canvHistory:hideSnapshot
  // -------------------------------------------------------------------------
  describe('canvHistory:hideSnapshot', () => {
    it('happy: routes to hideSnapshot(id)', expectRoutes({
      channel: 'canvHistory:hideSnapshot',
      method: 'hideSnapshot',
      args: ['s1'],
      result: { ok: true },
    }))
    it('error: propagates hideSnapshot failure', expectPropagates({
      channel: 'canvHistory:hideSnapshot',
      method: 'hideSnapshot',
      args: ['s1'],
      message: 'hide failed',
    }))
  })

  // -------------------------------------------------------------------------
  // canvHistory:patchSnapshotFiles
  // -------------------------------------------------------------------------
  describe('canvHistory:patchSnapshotFiles', () => {
    it('happy: routes to patchSnapshotFiles(id, files)', expectRoutes({
      channel: 'canvHistory:patchSnapshotFiles',
      method: 'patchSnapshotFiles',
      args: ['s1', [{ rel: 'a.md', label: 'edit' }]],
      result: { updated: ['a.md'] },
    }))
    it('error: propagates patchSnapshotFiles failure', expectPropagates({
      channel: 'canvHistory:patchSnapshotFiles',
      method: 'patchSnapshotFiles',
      args: ['s1', []],
      message: 'patch failed',
    }))
  })

  // -------------------------------------------------------------------------
  // canvHistory:getTipCommit
  // -------------------------------------------------------------------------
  describe('canvHistory:getTipCommit', () => {
    it('happy: routes to getTipCommit()', expectRoutes({
      channel: 'canvHistory:getTipCommit',
      method: 'getTipCommit',
      result: { sha: 'abc' },
    }))
    it('error: propagates getTipCommit failure', expectPropagates({
      channel: 'canvHistory:getTipCommit',
      method: 'getTipCommit',
      message: 'tip failed',
    }))
  })

  // -------------------------------------------------------------------------
  // canvHistory:getSnapshotDelta
  // -------------------------------------------------------------------------
  describe('canvHistory:getSnapshotDelta', () => {
    it('happy: routes to getSnapshotDelta(id)', expectRoutes({
      channel: 'canvHistory:getSnapshotDelta',
      method: 'getSnapshotDelta',
      args: ['s1'],
      result: { added: [], removed: [], modified: ['a.md'] },
    }))
    it('error: propagates getSnapshotDelta failure', expectPropagates({
      channel: 'canvHistory:getSnapshotDelta',
      method: 'getSnapshotDelta',
      args: ['s1'],
      message: 'delta failed',
    }))
  })

  // -------------------------------------------------------------------------
  // canvHistory:getFileHistory
  // -------------------------------------------------------------------------
  describe('canvHistory:getFileHistory', () => {
    it('happy: routes to getFileHistory(rel)', expectRoutes({
      channel: 'canvHistory:getFileHistory',
      method: 'getFileHistory',
      args: ['a.md'],
      result: [{ id: 's1' }, { id: 's2' }],
    }))
    it('error: propagates getFileHistory failure', expectPropagates({
      channel: 'canvHistory:getFileHistory',
      method: 'getFileHistory',
      args: ['a.md'],
      message: 'fileHistory failed',
    }))
  })

  // -------------------------------------------------------------------------
  // getHistoryService() called lazily — each invocation calls it fresh
  // (so workspace switches re-read the singleton).
  // -------------------------------------------------------------------------
  describe('lazy getHistoryService', () => {
    it('each handler invocation calls getHistoryService() (so it can re-read after workspace switch)', async () => {
      const ipc2 = makeIpcMain()
      const calls = []
      const svc1 = makeHistoryStub()
      svc1.getTipCommit.mockResolvedValue({ sha: 'one' })
      const svc2 = makeHistoryStub()
      svc2.getTipCommit.mockResolvedValue({ sha: 'two' })
      let current = svc1
      svc.registerIpcHandlers(ipc2, {
        getHistoryService: () => { calls.push(current); return current },
      })
      const r1 = await ipc2.invoke('canvHistory:getTipCommit')
      expect(r1).toEqual({ sha: 'one' })
      current = svc2
      const r2 = await ipc2.invoke('canvHistory:getTipCommit')
      expect(r2).toEqual({ sha: 'two' })
      expect(calls).toHaveLength(2)
    })
  })
})
