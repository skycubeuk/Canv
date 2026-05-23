'use strict'
// describe/it/expect/beforeEach/afterEach/vi are injected by vitest globals.

// ---------------------------------------------------------------------------
// IPC handler integration tests for the mcp service.
//
// The SERVICE methods (`listTools`, `callTool`, `testServer`, `reconnectServer`,
// `connectOne` per-transport) are exhaustively covered by:
//   - per-server.test.cjs (testServer / reconnectServer happy + error)
//   - stdio.test.cjs / http.test.cjs (real subprocess + SSE end-to-end)
//
// This file covers the registered `ipcMain.handle` entries directly. The
// strategy: replace `createMcpService` on the module exports with a stubbed
// factory before calling `registerIpcHandlers`, then drive the handlers via a
// fake ipcMain and assert routing + result shape.
// ---------------------------------------------------------------------------

const svc = require('./index.cjs')

function makeIpcMain() {
  const handlers = new Map()
  return {
    handle(name, fn) { handlers.set(name, fn) },
    async invoke(name, ...args) {
      const fn = handlers.get(name)
      if (!fn) throw new Error(`no handler: ${name}`)
      return fn({}, ...args)
    },
    removeHandler() {},
  }
}

function makeStubService(overrides = {}) {
  return {
    listTools: vi.fn().mockResolvedValue([{ name: 'a__ping', server: 'a' }]),
    callTool: vi.fn().mockResolvedValue({ ok: true, result: 'x' }),
    testServer: vi.fn().mockResolvedValue({ ok: true, tools: [] }),
    reconnectServer: vi.fn().mockResolvedValue({ ok: true, tools: [] }),
    shutdown: vi.fn().mockResolvedValue(undefined),
    ensureConnected: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('mcp service IPC handlers', () => {
  let ipcMain
  let stubService
  let createSpy

  beforeEach(() => {
    ipcMain = makeIpcMain()
    stubService = makeStubService()
    // Replace the factory so registerIpcHandlers binds handlers to our stub.
    createSpy = vi.spyOn(svc, 'createMcpService').mockReturnValue(stubService)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('canvMcp:setServers updates config and runs the shutdown→ensureConnected cycle', async () => {
    svc.registerIpcHandlers(ipcMain, {})

    const cfgs = [{ name: 'srv', transport: 'stdio', command: 'true' }]
    const r = await ipcMain.invoke('canvMcp:setServers', cfgs)

    expect(r).toEqual({ ok: true })
    expect(stubService.shutdown).toHaveBeenCalledTimes(1)
    expect(stubService.ensureConnected).toHaveBeenCalledTimes(1)
    // shutdown must run before ensureConnected.
    const shutdownOrder = stubService.shutdown.mock.invocationCallOrder[0]
    const ensureOrder = stubService.ensureConnected.mock.invocationCallOrder[0]
    expect(shutdownOrder).toBeLessThan(ensureOrder)
  })

  it('canvMcp:setServers coerces a non-array payload to an empty config without throwing', async () => {
    svc.registerIpcHandlers(ipcMain, {})

    // Pass a bogus payload — should not throw; the handler normalises to [].
    const r = await ipcMain.invoke('canvMcp:setServers', 'not-an-array')
    expect(r).toEqual({ ok: true })
    expect(stubService.shutdown).toHaveBeenCalledTimes(1)
    expect(stubService.ensureConnected).toHaveBeenCalledTimes(1)
  })

  it('canvMcp:listTools returns the merged tool list from the service', async () => {
    stubService.listTools.mockResolvedValueOnce([
      { name: 'a__ping', server: 'a', description: '', inputSchema: { type: 'object' } },
      { name: 'b__echo', server: 'b', description: '', inputSchema: { type: 'object' } },
    ])
    svc.registerIpcHandlers(ipcMain, {})

    const tools = await ipcMain.invoke('canvMcp:listTools')
    expect(tools).toHaveLength(2)
    expect(tools[0]).toMatchObject({ name: 'a__ping', server: 'a' })
    expect(stubService.listTools).toHaveBeenCalledTimes(1)
  })

  it('canvMcp:listTools propagates service errors', async () => {
    stubService.listTools.mockRejectedValueOnce(new Error('listTools boom'))
    svc.registerIpcHandlers(ipcMain, {})

    await expect(ipcMain.invoke('canvMcp:listTools')).rejects.toThrow(/listTools boom/)
  })

  it('canvMcp:callTool forwards the qualified name + args to service.callTool', async () => {
    stubService.callTool.mockResolvedValueOnce({ ok: true, result: { value: 42 } })
    svc.registerIpcHandlers(ipcMain, {})

    const r = await ipcMain.invoke('canvMcp:callTool', 'a__ping', { msg: 'hi' })
    expect(r).toEqual({ ok: true, result: { value: 42 } })
    expect(stubService.callTool).toHaveBeenCalledWith('a__ping', { msg: 'hi' })
  })

  it('canvMcp:callTool returns ok:false for a bad qualified name (service contract pass-through)', async () => {
    stubService.callTool.mockResolvedValueOnce({ ok: false, error: 'bad tool name: nope' })
    svc.registerIpcHandlers(ipcMain, {})

    const r = await ipcMain.invoke('canvMcp:callTool', 'nope', {})
    expect(r).toEqual({ ok: false, error: 'bad tool name: nope' })
  })

  it('canvMcp:reconnect runs shutdown then ensureConnected', async () => {
    svc.registerIpcHandlers(ipcMain, {})

    const r = await ipcMain.invoke('canvMcp:reconnect')
    expect(r).toEqual({ ok: true })
    expect(stubService.shutdown).toHaveBeenCalledTimes(1)
    expect(stubService.ensureConnected).toHaveBeenCalledTimes(1)
    const shutdownOrder = stubService.shutdown.mock.invocationCallOrder[0]
    const ensureOrder = stubService.ensureConnected.mock.invocationCallOrder[0]
    expect(shutdownOrder).toBeLessThan(ensureOrder)
  })

  it('canvMcp:reconnect propagates shutdown errors', async () => {
    stubService.shutdown.mockRejectedValueOnce(new Error('shutdown failed'))
    svc.registerIpcHandlers(ipcMain, {})

    await expect(ipcMain.invoke('canvMcp:reconnect')).rejects.toThrow(/shutdown failed/)
    // ensureConnected should not have been reached.
    expect(stubService.ensureConnected).not.toHaveBeenCalled()
  })

  it('canvMcp:testServer routes to service.testServer by name', async () => {
    stubService.testServer.mockResolvedValueOnce({
      ok: true,
      tools: [{ name: 'ping', description: '', inputSchema: { type: 'object' } }],
    })
    svc.registerIpcHandlers(ipcMain, {})

    const r = await ipcMain.invoke('canvMcp:testServer', 'srv')
    expect(r.ok).toBe(true)
    expect(stubService.testServer).toHaveBeenCalledWith('srv')
  })

  it('canvMcp:reconnectServer routes to service.reconnectServer by name', async () => {
    stubService.reconnectServer.mockResolvedValueOnce({ ok: true, tools: [] })
    svc.registerIpcHandlers(ipcMain, {})

    const r = await ipcMain.invoke('canvMcp:reconnectServer', 'srv')
    expect(r.ok).toBe(true)
    expect(stubService.reconnectServer).toHaveBeenCalledWith('srv')
  })

  it('registerIpcHandlers wires the factory exactly once and exposes the service handle', async () => {
    const result = svc.registerIpcHandlers(ipcMain, {})
    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(result.service).toBe(stubService)
  })
})
