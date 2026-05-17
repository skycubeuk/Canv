const { validateManifest } = require('./manifest-schema.cjs')

function valid(overrides = {}) {
  return {
    id: 'hello-world',
    name: 'Hello World',
    version: '1.0.0',
    capabilities: ['activeDoc.read'],
    contributions: [{
      type: 'panel', id: 'main', title: 'Hello',
      icon: 'bar-chart', location: 'right-sidebar', entry: 'panels/main.html',
    }],
    ...overrides,
  }
}

describe('validateManifest', () => {
  it('accepts a minimal valid manifest', () => {
    const r = validateManifest(valid())
    expect(r.ok).toBe(true)
    expect(r.manifest.id).toBe('hello-world')
  })
  it('rejects when id is missing', () => {
    const m = valid()
    delete m.id
    const r = validateManifest(m)
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/id/)
  })
  it('rejects when id contains a slash (path-injection guard)', () => {
    const r = validateManifest(valid({ id: '../etc' }))
    expect(r.ok).toBe(false)
  })
  it('rejects an unknown capability string', () => {
    const r = validateManifest(valid({ capabilities: ['activeDoc.read', 'made-up'] }))
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/made-up/)
  })
  it('rejects an unsupported contribution type (Phase 1)', () => {
    const r = validateManifest(valid({
      contributions: [{ type: 'command', id: 'foo', title: 'Foo', entry: 'x.html' }],
    }))
    expect(r.ok).toBe(false)
    expect(r.errors.join(' ')).toMatch(/command|panel/)
  })
  it('rejects a contribution.entry that escapes the extension dir', () => {
    const r = validateManifest(valid({
      contributions: [{
        type: 'panel', id: 'm', title: 'M', icon: 'x',
        location: 'right-sidebar', entry: '../../../etc/passwd',
      }],
    }))
    expect(r.ok).toBe(false)
  })
  it('rejects a non-semver version', () => {
    const r = validateManifest(valid({ version: 'banana' }))
    expect(r.ok).toBe(false)
  })
  it('rejects an empty contributions array', () => {
    const r = validateManifest(valid({ contributions: [] }))
    expect(r.ok).toBe(false)
  })
  it('accepts network whitelist entries that look like hostnames', () => {
    const r = validateManifest(valid({ network: ['api.openai.com', 'arxiv.org'] }))
    expect(r.ok).toBe(true)
  })
  it('rejects network entries with schemes or paths', () => {
    const r = validateManifest(valid({ network: ['https://example.com/path'] }))
    expect(r.ok).toBe(false)
  })
})
