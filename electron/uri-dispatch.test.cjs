'use strict'

describe('uri-dispatch queue', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('queues URIs received before the dispatcher is set, and flushes on setDispatcher', async () => {
    const mod = await import('./uri-dispatch.cjs')
    const seen = []
    mod.enqueue('canv://a/one')
    mod.enqueue('canv://b/two')
    mod.setDispatcher((u) => seen.push(u))
    expect(seen).toEqual(['canv://a/one', 'canv://b/two'])
  })

  it('dispatches immediately when a dispatcher is already set', async () => {
    const mod = await import('./uri-dispatch.cjs')
    const seen = []
    mod.setDispatcher((u) => seen.push(u))
    mod.enqueue('canv://x')
    expect(seen).toEqual(['canv://x'])
  })

  it('ignores non-string and non-canv URIs', async () => {
    const mod = await import('./uri-dispatch.cjs')
    const seen = []
    mod.setDispatcher((u) => seen.push(u))
    mod.enqueue(null)
    mod.enqueue('http://example.com')
    mod.enqueue(123)
    expect(seen).toEqual([])
  })

  it('isolates dispatcher exceptions', async () => {
    const mod = await import('./uri-dispatch.cjs')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mod.setDispatcher(() => { throw new Error('boom') })
    mod.enqueue('canv://x')   // must not throw
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('uri-dispatch registerProtocolHandler', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns ok:true with dev-skip reason in unpackaged builds', async () => {
    const mod = await import('./uri-dispatch.cjs')
    const fakeApp = {
      isPackaged: false,
      setAsDefaultProtocolClient: vi.fn(),
      requestSingleInstanceLock: vi.fn(),
      quit: vi.fn(),
      on: vi.fn(),
    }
    const r = mod.registerProtocolHandler({ app: fakeApp, getMainWindow: () => null })
    expect(r).toEqual({ ok: true, reason: 'dev-skip' })
    expect(fakeApp.setAsDefaultProtocolClient).not.toHaveBeenCalled()
    expect(fakeApp.requestSingleInstanceLock).not.toHaveBeenCalled()
  })

  it('returns ok:false with no-lock reason when the single-instance lock is held', async () => {
    const mod = await import('./uri-dispatch.cjs')
    const fakeApp = {
      isPackaged: true,
      setAsDefaultProtocolClient: vi.fn(),
      requestSingleInstanceLock: vi.fn(() => false),
      quit: vi.fn(),
      on: vi.fn(),
    }
    // process.defaultApp is undefined under vitest, which is the production
    // case — !process.defaultApp passes, so we reach the lock check.
    const r = mod.registerProtocolHandler({ app: fakeApp, getMainWindow: () => null })
    expect(r).toEqual({ ok: false, reason: 'no-lock' })
    expect(fakeApp.quit).toHaveBeenCalled()
    // open-url / second-instance must NOT have been wired when the lock failed.
    expect(fakeApp.on).not.toHaveBeenCalled()
  })

  it('returns ok:true with registered reason when the lock is acquired', async () => {
    const mod = await import('./uri-dispatch.cjs')
    const fakeApp = {
      isPackaged: true,
      setAsDefaultProtocolClient: vi.fn(),
      requestSingleInstanceLock: vi.fn(() => true),
      quit: vi.fn(),
      on: vi.fn(),
    }
    const r = mod.registerProtocolHandler({ app: fakeApp, getMainWindow: () => null })
    expect(r).toEqual({ ok: true, reason: 'registered' })
    expect(fakeApp.setAsDefaultProtocolClient).toHaveBeenCalledWith('canv')
    // Both 'open-url' and 'second-instance' listeners were registered.
    const events = fakeApp.on.mock.calls.map((c) => c[0]).sort()
    expect(events).toEqual(['open-url', 'second-instance'])
  })
})
