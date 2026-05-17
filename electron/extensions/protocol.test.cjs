const path = require('node:path')
const { resolveProtocolRequest, buildCspHeader } = require('./protocol.cjs')

describe('resolveProtocolRequest', () => {
  const extDir = path.resolve('/tmp/canv-exts/hello')
  const sharedDir = path.resolve('/tmp/canv-shared')
  const ctx = {
    extensionDirFor: (id) => id === 'hello' ? extDir : null,
    sharedDir,
  }

  it('resolves an extension file under its dir', () => {
    const r = resolveProtocolRequest('canv-extension://hello/panels/main.html', ctx)
    expect(r.status).toBe(200)
    expect(r.filePath).toBe(path.join(extDir, 'panels', 'main.html'))
    expect(r.extensionId).toBe('hello')
  })
  it('resolves a shared asset under canv-shared', () => {
    const r = resolveProtocolRequest('canv-extension://canv-shared/canv-ui.css', ctx)
    expect(r.status).toBe(200)
    expect(r.filePath).toBe(path.join(sharedDir, 'canv-ui.css'))
    expect(r.extensionId).toBe(null)
  })
  it('serves index.html when path is empty (entry HTML fallback)', () => {
    const r = resolveProtocolRequest('canv-extension://hello/', ctx)
    expect(r.status).toBe(200)
    expect(r.filePath).toBe(path.join(extDir, 'index.html'))
  })
  it('404s an unknown extension id', () => {
    const r = resolveProtocolRequest('canv-extension://nope/panels/main.html', ctx)
    expect(r.status).toBe(404)
  })
  it('403s a path that escapes the extension dir', () => {
    const r = resolveProtocolRequest('canv-extension://hello/../../etc/passwd', ctx)
    expect(r.status).toBe(403)
  })
  it('403s percent-encoded parent traversal', () => {
    const r = resolveProtocolRequest('canv-extension://hello/%2e%2e/etc/passwd', ctx)
    expect(r.status).toBe(403)
  })
  it('403s percent-encoded slashes wrapping traversal', () => {
    const r = resolveProtocolRequest('canv-extension://hello/%2F%2E%2E%2F', ctx)
    expect(r.status).toBe(403)
  })
  it('403s a path with NUL bytes', () => {
    const r = resolveProtocolRequest('canv-extension://hello/foo%00bar', ctx)
    expect(r.status).toBe(403)
  })
  it('400s a malformed URL', () => {
    const r = resolveProtocolRequest('not-a-url', ctx)
    expect(r.status).toBe(400)
  })
})

describe('buildCspHeader', () => {
  it('allows self + canv-shared in connect-src when manifest.network is empty', () => {
    const csp = buildCspHeader({ network: [] })
    expect(csp).toMatch(/connect-src 'self' canv-extension:\/\/canv-shared(\s|;|$)/)
    expect(csp).toMatch(/default-src 'self'/)
    // No external origins reachable when network is empty.
    expect(csp).not.toMatch(/connect-src [^;]*https:/)
  })
  it('whitelists declared origins in connect-src alongside self + canv-shared', () => {
    const csp = buildCspHeader({ network: ['api.openai.com', 'arxiv.org'] })
    expect(csp).toMatch(/connect-src 'self' canv-extension:\/\/canv-shared https:\/\/api\.openai\.com https:\/\/arxiv\.org/)
  })
  it('allows canv-shared in script-src and style-src so auto-injected assets load', () => {
    const csp = buildCspHeader({ network: [] })
    expect(csp).toMatch(/script-src 'self' canv-extension:\/\/canv-shared/)
    expect(csp).toMatch(/style-src 'self' 'unsafe-inline' canv-extension:\/\/canv-shared/)
    // Scripts still never get 'unsafe-inline'.
    expect(csp).not.toMatch(/script-src [^;]*'unsafe-inline'/)
  })
  it('forbids object-src and frame-ancestors entirely', () => {
    const csp = buildCspHeader({ network: [] })
    expect(csp).toMatch(/object-src 'none'/)
    expect(csp).toMatch(/frame-ancestors 'none'/)
  })
})
