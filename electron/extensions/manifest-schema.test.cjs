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

  describe('settings field', () => {
    it('accepts a number setting with min/max/default', () => {
      const r = validateManifest(valid({
        settings: [{ key: 'target', type: 'number', default: 50000, min: 0, max: 1e7, label: 'Target' }],
      }))
      expect(r.ok).toBe(true)
    })
    it('accepts a boolean setting', () => {
      const r = validateManifest(valid({
        settings: [{ key: 'enabled', type: 'boolean', default: true }],
      }))
      expect(r.ok).toBe(true)
    })
    it('accepts an enum setting with options', () => {
      const r = validateManifest(valid({
        settings: [{ key: 'mode', type: 'enum', options: ['a', 'b', 'c'], default: 'b' }],
      }))
      expect(r.ok).toBe(true)
    })
    it('rejects enum setting without options', () => {
      const r = validateManifest(valid({
        settings: [{ key: 'mode', type: 'enum' }],
      }))
      expect(r.ok).toBe(false)
    })
    it('rejects duplicate setting keys', () => {
      const r = validateManifest(valid({
        settings: [
          { key: 'x', type: 'number' },
          { key: 'x', type: 'boolean' },
        ],
      }))
      expect(r.ok).toBe(false)
      expect(r.errors.join(' ')).toMatch(/duplicate/i)
    })
    it('rejects setting key with invalid chars', () => {
      const r = validateManifest(valid({
        settings: [{ key: 'has space', type: 'number' }],
      }))
      expect(r.ok).toBe(false)
    })
    it('rejects default value whose type does not match the schema', () => {
      const r = validateManifest(valid({
        settings: [{ key: 'x', type: 'number', default: 'oops' }],
      }))
      expect(r.ok).toBe(false)
    })
    it('rejects enum default that is not in options', () => {
      const r = validateManifest(valid({
        settings: [{ key: 'mode', type: 'enum', options: ['a', 'b'], default: 'c' }],
      }))
      expect(r.ok).toBe(false)
    })
  })

  describe('activationEvents', () => {
    it('accepts onStartup', () => {
      expect(validateManifest(valid({ activationEvents: ['onStartup'] })).ok).toBe(true)
    })
    it('accepts onCommand:<id>', () => {
      expect(validateManifest(valid({ activationEvents: ['onCommand:foo.bar'] })).ok).toBe(true)
    })
    it('accepts onPanelOpen:<location>:<panelId>', () => {
      expect(validateManifest(valid({ activationEvents: ['onPanelOpen:right-sidebar:main'] })).ok).toBe(true)
    })
    it('rejects unknown activation event prefix', () => {
      expect(validateManifest(valid({ activationEvents: ['onClick:foo'] })).ok).toBe(false)
    })
    it('rejects malformed onPanelOpen with wrong location', () => {
      expect(validateManifest(valid({ activationEvents: ['onPanelOpen:weird-place:main'] })).ok).toBe(false)
    })
  })
})
