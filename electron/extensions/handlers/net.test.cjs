const { ExtensionRuntime } = require('../runtime.cjs')
const { createNetHandlers } = require('./net.cjs')
const { CapabilityError } = require('../capability.cjs')

function makeFakeFetch(impl) {
  const calls = []
  const fn = async (url, init) => {
    calls.push({ url, init })
    return impl ? impl(url, init) : {
      ok: true, status: 200, statusText: 'OK',
      text: async () => 'hello', json: async () => ({ ok: true }),
      headers: new Map([['content-type', 'text/plain']]),
    }
  }
  return { fn, calls }
}

function setup({ caps = ['net'], network = [], fetchImpl = null } = {}) {
  const rt = new ExtensionRuntime()
  rt._registerForTest({
    id: 'ext', manifest: { id: 'ext', capabilities: caps, network },
    extensionDir: '/tmp/ext', webContentsId: 1,
  })
  const { fn: fakeFetch, calls } = makeFakeFetch(fetchImpl)
  return { rt, calls, event: { sender: { id: 1 } },
    handlers: createNetHandlers({ runtime: rt, fetchImpl: fakeFetch }) }
}

describe('net handlers', () => {
  it('requires net capability', async () => {
    const { handlers, event } = setup({ caps: [], network: ['example.com'] })
    await expect(handlers['canvExt:net.fetch'](event, 'https://example.com/x'))
      .rejects.toBeInstanceOf(CapabilityError)
  })
  it('rejects URL with origin not in manifest.network', async () => {
    const { handlers, event } = setup({ network: ['example.com'] })
    await expect(handlers['canvExt:net.fetch'](event, 'https://evil.example/x'))
      .rejects.toThrow(/origin not whitelisted/i)
  })
  it('rejects non-HTTPS URLs', async () => {
    const { handlers, event } = setup({ network: ['example.com'] })
    await expect(handlers['canvExt:net.fetch'](event, 'http://example.com/x'))
      .rejects.toThrow(/https/i)
    await expect(handlers['canvExt:net.fetch'](event, 'file:///etc/passwd'))
      .rejects.toThrow(/https/i)
  })
  it('rejects malformed URL', async () => {
    const { handlers, event } = setup({ network: ['example.com'] })
    await expect(handlers['canvExt:net.fetch'](event, 'not a url'))
      .rejects.toThrow()
  })
  it('forwards allowed request and returns serialised response', async () => {
    const { handlers, event, calls } = setup({ network: ['example.com'] })
    const r = await handlers['canvExt:net.fetch'](event, 'https://example.com/foo', { method: 'POST', body: 'hi' })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://example.com/foo')
    expect(calls[0].init.method).toBe('POST')
    expect(r.ok).toBe(true)
    expect(r.status).toBe(200)
    expect(r.body).toBe('hello')
  })
  it('strips Cookie header but passes Authorization through', async () => {
    const { handlers, event, calls } = setup({ network: ['example.com'] })
    await handlers['canvExt:net.fetch'](event, 'https://example.com/x', {
      headers: { Cookie: 'session=secret', Authorization: 'Bearer xyz' },
    })
    const h = calls[0].init.headers
    expect(h.Cookie || h.cookie).toBeUndefined()
    expect(h.Authorization).toBe('Bearer xyz')
  })
  it('returns response body even on non-OK status', async () => {
    const { handlers, event } = setup({
      network: ['example.com'],
      fetchImpl: async () => ({
        ok: false, status: 404, statusText: 'Not Found',
        text: async () => 'nope',
        headers: new Map(),
      }),
    })
    const r = await handlers['canvExt:net.fetch'](event, 'https://example.com/x')
    expect(r.ok).toBe(false)
    expect(r.status).toBe(404)
    expect(r.body).toBe('nope')
  })
  it('calls onRequest with extension id on each request', async () => {
    const onRequest = vi.fn()
    const { fn: fakeFetch } = makeFakeFetch()
    const rt = new ExtensionRuntime()
    rt._registerForTest({
      id: 'ext', manifest: { id: 'ext', capabilities: ['net'], network: ['example.com'] },
      extensionDir: '/tmp/ext', webContentsId: 1,
    })
    const handlers = createNetHandlers({ runtime: rt, fetchImpl: fakeFetch, onRequest })
    await handlers['canvExt:net.fetch']({ sender: { id: 1 } }, 'https://example.com/x')
    expect(onRequest).toHaveBeenCalledWith('ext')
  })
})
