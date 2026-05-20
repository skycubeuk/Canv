const { validateManifest } = require('./manifest-schema.cjs')
const { CANV_API_VERSION } = require('./api-version.cjs')

function valid(overrides = {}) {
  return {
    id: 'hello-world',
    name: 'Hello World',
    version: '1.0.0',
    engines: { canv: '^1.0.0' },
    capabilities: ['activeDoc.read'],
    contributions: [{
      type: 'panel', id: 'main', title: 'Hello',
      icon: 'bar-chart', location: 'left-sidebar', entry: 'panels/main.html',
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
  it('now accepts command contribution type (Phase 5a)', () => {
    const r = validateManifest(valid({
      contributions: [{ type: 'command', id: 'foo.bar', title: 'Foo', entry: 'x.html' }],
    }))
    expect(r.ok).toBe(true)
  })
  it('rejects a contribution.entry that escapes the extension dir', () => {
    const r = validateManifest(valid({
      contributions: [{
        type: 'panel', id: 'm', title: 'M', icon: 'x',
        location: 'left-sidebar', entry: '../../../etc/passwd',
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
      expect(validateManifest(valid({ activationEvents: ['onPanelOpen:left-sidebar:main'] })).ok).toBe(true)
    })
    it('rejects unknown activation event prefix', () => {
      expect(validateManifest(valid({ activationEvents: ['onClick:foo'] })).ok).toBe(false)
    })
    it('rejects malformed onPanelOpen with wrong location', () => {
      expect(validateManifest(valid({ activationEvents: ['onPanelOpen:weird-place:main'] })).ok).toBe(false)
    })
  })

  describe('contribution: fileHandler', () => {
    it('accepts a valid viewer fileHandler', () => {
      const r = validateManifest(valid({
        contributions: [{ type: 'fileHandler', id: 'pdf', extensions: ['.pdf'], mode: 'viewer', entry: 'panels/pdf.html' }],
      }))
      expect(r.ok).toBe(true)
    })
    it('accepts a valid editor fileHandler with multiple extensions', () => {
      const r = validateManifest(valid({
        contributions: [{ type: 'fileHandler', id: 'epub', extensions: ['.epub', '.mobi'], mode: 'editor', entry: 'panels/epub.html' }],
      }))
      expect(r.ok).toBe(true)
    })
    it('rejects fileHandler with malformed extension (no leading dot)', () => {
      const r = validateManifest(valid({
        contributions: [{ type: 'fileHandler', id: 'x', extensions: ['pdf'], mode: 'viewer', entry: 'x.html' }],
      }))
      expect(r.ok).toBe(false)
    })
    it('rejects fileHandler with empty extensions array', () => {
      const r = validateManifest(valid({
        contributions: [{ type: 'fileHandler', id: 'x', extensions: [], mode: 'viewer', entry: 'x.html' }],
      }))
      expect(r.ok).toBe(false)
    })
    it('rejects fileHandler with invalid mode', () => {
      const r = validateManifest(valid({
        contributions: [{ type: 'fileHandler', id: 'x', extensions: ['.pdf'], mode: 'reader', entry: 'x.html' }],
      }))
      expect(r.ok).toBe(false)
    })
  })

  describe('contribution: command', () => {
    it('accepts a valid command with keybinding', () => {
      const r = validateManifest(valid({
        contributions: [{ type: 'command', id: 'wc.refresh', title: 'Refresh', entry: 'panels/main.html', keybinding: 'Ctrl+Shift+W' }],
      }))
      expect(r.ok).toBe(true)
    })
    it('accepts a command without keybinding', () => {
      const r = validateManifest(valid({
        contributions: [{ type: 'command', id: 'wc.refresh', title: 'Refresh', entry: 'panels/main.html' }],
      }))
      expect(r.ok).toBe(true)
    })
    it('rejects command id with invalid chars', () => {
      const r = validateManifest(valid({
        contributions: [{ type: 'command', id: 'has space', title: 'X', entry: 'x.html' }],
      }))
      expect(r.ok).toBe(false)
    })
    it('rejects command keybinding with no recognised modifier', () => {
      const r = validateManifest(valid({
        contributions: [{ type: 'command', id: 'x', title: 'X', entry: 'x.html', keybinding: 'JustQ' }],
      }))
      expect(r.ok).toBe(false)
    })
  })

  describe('contribution: menu', () => {
    it('accepts a fileTree.context menu with a command and when clause', () => {
      const r = validateManifest(valid({
        contributions: [
          { type: 'command', id: 'foo.bar', title: 'X', entry: 'x.html' },
          { type: 'menu', menu: 'fileTree.context', command: 'foo.bar', title: 'Do thing', when: 'fileExt:.md' },
        ],
      }))
      expect(r.ok).toBe(true)
    })
    it('rejects menu with unknown menu value', () => {
      const r = validateManifest(valid({
        contributions: [
          { type: 'command', id: 'foo.bar', title: 'X', entry: 'x.html' },
          { type: 'menu', menu: 'editor.context', command: 'foo.bar' },
        ],
      }))
      expect(r.ok).toBe(false)
    })
    it('rejects menu with malformed when clause', () => {
      const r = validateManifest(valid({
        contributions: [
          { type: 'command', id: 'foo.bar', title: 'X', entry: 'x.html' },
          { type: 'menu', menu: 'fileTree.context', command: 'foo.bar', when: 'isReadme' },
        ],
      }))
      expect(r.ok).toBe(false)
    })
  })

  describe('contribution: statusBar', () => {
    it('accepts a valid statusBar item with text + icon + tooltip + command', () => {
      const r = validateManifest(valid({
        contributions: [
          { type: 'command', id: 'wc.refresh', title: 'X', entry: 'x.html' },
          { type: 'statusBar', id: 'total', alignment: 'right', priority: 30, text: '${total} words', icon: 'bar-chart', tooltip: 'Word count', command: 'wc.refresh' },
        ],
      }))
      expect(r.ok).toBe(true)
    })
    it('accepts statusBar with just text', () => {
      const r = validateManifest(valid({
        contributions: [{ type: 'statusBar', id: 'x', alignment: 'left', priority: 10, text: 'hello' }],
      }))
      expect(r.ok).toBe(true)
    })
    it('rejects statusBar with invalid alignment', () => {
      const r = validateManifest(valid({
        contributions: [{ type: 'statusBar', id: 'x', alignment: 'center', priority: 10, text: 'X' }],
      }))
      expect(r.ok).toBe(false)
    })
    it('rejects statusBar with priority out of range', () => {
      const r = validateManifest(valid({
        contributions: [{ type: 'statusBar', id: 'x', alignment: 'right', priority: 0, text: 'X' }],
      }))
      expect(r.ok).toBe(false)
      const r2 = validateManifest(valid({
        contributions: [{ type: 'statusBar', id: 'x', alignment: 'right', priority: 100, text: 'X' }],
      }))
      expect(r2.ok).toBe(false)
    })
  })

  describe('contribution: language', () => {
    it('accepts a valid language contribution', () => {
      const r = validateManifest(valid({
        contributions: [{ type: 'language', extensions: ['.tex', '.bib'], entry: 'language/tex.js' }],
      }))
      expect(r.ok).toBe(true)
    })
    it('rejects language with malformed extension', () => {
      const r = validateManifest(valid({
        contributions: [{ type: 'language', extensions: ['tex'], entry: 'language/tex.js' }],
      }))
      expect(r.ok).toBe(false)
    })
    it('rejects language with empty extensions array', () => {
      const r = validateManifest(valid({
        contributions: [{ type: 'language', extensions: [], entry: 'language/tex.js' }],
      }))
      expect(r.ok).toBe(false)
    })
  })

  describe('engines.canv', () => {
    const base = {
      id: 'eng-test',
      name: 'Engines Test',
      version: '1.0.0',
      contributions: [{ type: 'panel', id: 'p', title: 'P', icon: 'info', location: 'left-sidebar', entry: 'index.html' }],
    }

    it('refuses a manifest with no engines field', () => {
      const r = validateManifest(base)
      expect(r.ok).toBe(false)
      expect(r.errors.join(' ')).toMatch(/engines/)
    })

    it('refuses an engines.canv that is not a valid semver range', () => {
      const r = validateManifest({ ...base, engines: { canv: 'not-a-range' } })
      expect(r.ok).toBe(false)
      expect(r.errors.join(' ')).toMatch(/engines\.canv.*semver range/i)
    })

    it('refuses an empty engines.canv string', () => {
      const r = validateManifest({ ...base, engines: { canv: '' } })
      expect(r.ok).toBe(false)
    })

    it('refuses a whitespace-only engines.canv string', () => {
      const r = validateManifest({ ...base, engines: { canv: '   ' } })
      expect(r.ok).toBe(false)
    })

    it('refuses an engines.canv range that does not satisfy CANV_API_VERSION', () => {
      const r = validateManifest({ ...base, engines: { canv: '^99.0.0' } })
      expect(r.ok).toBe(false)
      expect(r.errors.join(' ')).toMatch(new RegExp(`not compatible.*${CANV_API_VERSION}`))
    })

    it('accepts a manifest whose engines.canv range satisfies CANV_API_VERSION', () => {
      const r = validateManifest({ ...base, engines: { canv: '^1.0.0' } })
      expect(r.ok).toBe(true)
      expect(r.manifest.engines.canv).toBe('^1.0.0')
    })
  })

  describe('panel location migration', () => {
    it('rejects right-sidebar (dropped in Phase 5)', () => {
      const r = validateManifest(valid({
        contributions: [{ type: 'panel', id: 'main', title: 'X', icon: 'info', location: 'right-sidebar', entry: 'x.html' }],
      }))
      expect(r.ok).toBe(false)
    })
    it('accepts left-sidebar', () => {
      const r = validateManifest(valid({
        contributions: [{ type: 'panel', id: 'main', title: 'X', icon: 'info', location: 'left-sidebar', entry: 'x.html' }],
      }))
      expect(r.ok).toBe(true)
    })
    it('accepts bottom-dock', () => {
      const r = validateManifest(valid({
        contributions: [{ type: 'panel', id: 'main', title: 'X', icon: 'info', location: 'bottom-dock', entry: 'x.html' }],
      }))
      expect(r.ok).toBe(true)
    })
  })
})
