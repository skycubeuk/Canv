const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { buildAllContributions } = require('./contributions.cjs')

function mkExtDir(base, id, manifest) {
  const dir = path.join(base, id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  return dir
}

describe('buildAllContributions', () => {
  it('returns empty slices when no extensions enabled', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'canv-contrib-'))
    const all = buildAllContributions(base, [])
    expect(all.panels).toEqual([])
    expect(all.commands).toEqual([])
    expect(all.statusBarItems).toEqual([])
  })

  it('returns panel records from a single extension', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'canv-contrib-'))
    mkExtDir(base, 'wc', {
      id: 'wc', name: 'WC', version: '1.0.0', capabilities: [],
      contributions: [
        { type: 'panel', id: 'main', title: 'WC', icon: 'bar-chart', location: 'left-sidebar', entry: 'panels/main.html' },
      ],
    })
    const all = buildAllContributions(base, [{ id: 'wc', enabled: true, trustedAt: '2026-01-01T00:00:00Z', manifestSha256: 'x', installedAt: 'x', version: '1.0.0' }])
    expect(all.panels).toHaveLength(1)
    expect(all.panels[0]).toMatchObject({ extensionId: 'wc', id: 'main', title: 'WC', location: 'left-sidebar' })
  })

  it('attaches extensionName to commands for palette subtitle', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'canv-contrib-'))
    mkExtDir(base, 'wc', {
      id: 'wc', name: 'Word Count', version: '1.0.0', capabilities: [],
      contributions: [
        { type: 'command', id: 'wc.refresh', title: 'Refresh', entry: 'panels/main.html' },
      ],
    })
    const all = buildAllContributions(base, [{ id: 'wc', enabled: true, trustedAt: 'x', manifestSha256: 'x', installedAt: 'x', version: '1.0.0' }])
    expect(all.commands).toHaveLength(1)
    expect(all.commands[0].extensionName).toBe('Word Count')
  })

  it('skips disabled extensions', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'canv-contrib-'))
    mkExtDir(base, 'wc', {
      id: 'wc', name: 'WC', version: '1.0.0', capabilities: [],
      contributions: [{ type: 'panel', id: 'main', title: 'WC', icon: 'x', location: 'left-sidebar', entry: 'x.html' }],
    })
    const all = buildAllContributions(base, [{ id: 'wc', enabled: false, trustedAt: 'x', manifestSha256: 'x', installedAt: 'x', version: '1.0.0' }])
    expect(all.panels).toEqual([])
  })

  it('skips untrusted extensions', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'canv-contrib-'))
    mkExtDir(base, 'wc', {
      id: 'wc', name: 'WC', version: '1.0.0', capabilities: [],
      contributions: [{ type: 'panel', id: 'main', title: 'WC', icon: 'x', location: 'left-sidebar', entry: 'x.html' }],
    })
    const all = buildAllContributions(base, [{ id: 'wc', enabled: true, trustedAt: null, manifestSha256: 'x', installedAt: 'x', version: '1.0.0' }])
    expect(all.panels).toEqual([])
  })

  it('tolerates missing or malformed manifest files (skips that extension)', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'canv-contrib-'))
    fs.mkdirSync(path.join(base, 'broken'), { recursive: true })
    fs.writeFileSync(path.join(base, 'broken', 'manifest.json'), 'not json')
    const all = buildAllContributions(base, [{ id: 'broken', enabled: true, trustedAt: 'x', manifestSha256: 'x', installedAt: 'x', version: '1.0.0' }])
    expect(all.panels).toEqual([])
  })

  it('returns all six contribution slices', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'canv-contrib-'))
    mkExtDir(base, 'kitchen-sink', {
      id: 'kitchen-sink', name: 'Kitchen Sink', version: '1.0.0', capabilities: [],
      contributions: [
        { type: 'panel', id: 'p', title: 'P', icon: 'x', location: 'left-sidebar', entry: 'p.html' },
        { type: 'fileHandler', id: 'fh', extensions: ['.pdf'], mode: 'viewer', entry: 'fh.html' },
        { type: 'command', id: 'k.do', title: 'Do', entry: 'p.html' },
        { type: 'menu', menu: 'fileTree.context', command: 'k.do' },
        { type: 'statusBar', id: 's', alignment: 'right', priority: 10, text: 'X' },
        { type: 'language', extensions: ['.tex'], entry: 'l.js' },
      ],
    })
    const all = buildAllContributions(base, [{ id: 'kitchen-sink', enabled: true, trustedAt: 'x', manifestSha256: 'x', installedAt: 'x', version: '1.0.0' }])
    expect(all.panels).toHaveLength(1)
    expect(all.fileHandlers).toHaveLength(1)
    expect(all.commands).toHaveLength(1)
    expect(all.menus).toHaveLength(1)
    expect(all.statusBarItems).toHaveLength(1)
    expect(all.languages).toHaveLength(1)
  })
})
