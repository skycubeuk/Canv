'use strict'

const { createMcpService } = require('./index.cjs')

describe('createMcpService — per-server methods', () => {
  let service
  let configs

  beforeEach(() => {
    configs = []
    service = createMcpService({ getConfig: () => configs })
  })

  afterEach(async () => {
    await service.shutdown()
    vi.restoreAllMocks()
  })

  it('testServer returns ok:false when no server matches the name', async () => {
    const r = await service.testServer('nonexistent')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/no server named.*nonexistent/i)
  })

  it('testServer connects and returns the tool list on success', async () => {
    configs.push({ name: 'fake', transport: 'stdio', command: 'true' })
    // Bypass the real subprocess spawn by stubbing connectOne via __test__.
    // The point of this test is the testServer wrapper's contract, not the SDK.
    const fakeTools = [
      { name: 'ping', description: 'returns pong', inputSchema: { type: 'object' } },
      { name: 'echo', description: 'echoes the input', inputSchema: { type: 'object' } },
    ]
    const originalConnectOne = service.__test__.connectOne
    vi.spyOn(service.__test__, 'connectOne').mockImplementation(async (cfg) => {
      service.__test__.handles.set(cfg.name, { client: {}, transport: {}, tools: fakeTools, cfg })
    })

    const r = await service.testServer('fake')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tools).toEqual(fakeTools)

    // Sanity: didn't accidentally double-connect on re-test.
    await service.testServer('fake')
    expect(service.__test__.connectOne).toHaveBeenCalledTimes(1)
    void originalConnectOne
  })

  it('testServer returns ok:false with the error message when connectOne throws', async () => {
    configs.push({ name: 'broken', transport: 'http', url: 'http://nowhere' })
    vi.spyOn(service.__test__, 'connectOne').mockImplementation(async () => {
      throw new Error('ECONNREFUSED')
    })

    const r = await service.testServer('broken')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/ECONNREFUSED/)
  })

  it('reconnectServer disconnects then runs a fresh testServer cycle', async () => {
    configs.push({ name: 'cycle', transport: 'stdio', command: 'true' })
    const disconnectSpy = vi.spyOn(service.__test__, 'disconnectOne')
    const connectSpy = vi.spyOn(service.__test__, 'connectOne').mockImplementation(async (cfg) => {
      service.__test__.handles.set(cfg.name, { client: {}, transport: {}, tools: [], cfg })
    })

    // First connect
    await service.testServer('cycle')
    expect(connectSpy).toHaveBeenCalledTimes(1)
    expect(disconnectSpy).not.toHaveBeenCalled()

    // Reconnect should disconnect THEN reconnect
    const r = await service.reconnectServer('cycle')
    expect(r.ok).toBe(true)
    expect(disconnectSpy).toHaveBeenCalledWith('cycle')
    expect(connectSpy).toHaveBeenCalledTimes(2)
  })

  it('reconnectServer surfaces connect errors after disconnecting', async () => {
    configs.push({ name: 'cycle', transport: 'stdio', command: 'true' })
    vi.spyOn(service.__test__, 'connectOne').mockImplementation(async () => {
      throw new Error('boom')
    })

    const r = await service.reconnectServer('cycle')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatch(/boom/)
  })
})
