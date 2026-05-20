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
