const { ExtensionRuntime } = require('../runtime.cjs')
const { createActiveDocHandlers } = require('./active-doc.cjs')
const { CapabilityError } = require('../capability.cjs')

function setup({ caps = ['activeDoc.read'] } = {}) {
  const rt = new ExtensionRuntime()
  rt._registerForTest({
    id: 'ext',
    manifest: { id: 'ext', capabilities: caps },
    extensionDir: '/tmp/ext',
    webContentsId: 1,
  })
  const host = {
    getActiveDocText:    async () => 'hello world',
    getActiveDocPath:    async () => '/ws/a.md',
    getActiveDocSelection: async () => ({ from: 0, to: 5, text: 'hello' }),
    insertAtCursor:      async (text) => { host.lastInsert = text },
    replaceSelection:    async (text) => { host.lastReplace = text },
    setActiveDocText:    async (text) => { host.lastSet = text },
  }
  const handlers = createActiveDocHandlers({ runtime: rt, host })
  const event = { sender: { id: 1 } }
  return { rt, host, handlers, event }
}

describe('activeDoc handlers', () => {
  it('getText returns host text when capability declared', async () => {
    const { handlers, event } = setup()
    await expect(handlers['canvExt:activeDoc.getText'](event)).resolves.toBe('hello world')
  })
  it('getText throws CapabilityError when not declared', async () => {
    const { handlers, event } = setup({ caps: [] })
    await expect(handlers['canvExt:activeDoc.getText'](event)).rejects.toBeInstanceOf(CapabilityError)
  })
  it('getPath returns active doc path when read declared', async () => {
    const { handlers, event } = setup()
    await expect(handlers['canvExt:activeDoc.getPath'](event)).resolves.toBe('/ws/a.md')
  })
  it('getSelection returns from/to/text when read declared', async () => {
    const { handlers, event } = setup()
    await expect(handlers['canvExt:activeDoc.getSelection'](event)).resolves.toEqual({ from: 0, to: 5, text: 'hello' })
  })
  it('insertAtCursor requires activeDoc.write', async () => {
    const { handlers, event } = setup() // only has .read
    await expect(handlers['canvExt:activeDoc.insertAtCursor'](event, 'x')).rejects.toBeInstanceOf(CapabilityError)
  })
  it('insertAtCursor calls host when write declared', async () => {
    const { handlers, host, event } = setup({ caps: ['activeDoc.write'] })
    await handlers['canvExt:activeDoc.insertAtCursor'](event, 'XYZ')
    expect(host.lastInsert).toBe('XYZ')
  })
  it('replaceSelection requires activeDoc.write', async () => {
    const { handlers, event } = setup()
    await expect(handlers['canvExt:activeDoc.replaceSelection'](event, 'x')).rejects.toBeInstanceOf(CapabilityError)
  })
  it('setText requires activeDoc.write', async () => {
    const { handlers, event } = setup()
    await expect(handlers['canvExt:activeDoc.setText'](event, 'x')).rejects.toBeInstanceOf(CapabilityError)
  })
  it('rejects callers whose webContents id is unknown', async () => {
    const { handlers } = setup()
    await expect(handlers['canvExt:activeDoc.getText']({ sender: { id: 999 } })).rejects.toThrow(/unknown caller/i)
  })
  it('rejects non-string write inputs', async () => {
    const { handlers, event } = setup({ caps: ['activeDoc.write'] })
    await expect(handlers['canvExt:activeDoc.insertAtCursor'](event, 42)).rejects.toThrow(/string/i)
    await expect(handlers['canvExt:activeDoc.setText'](event, null)).rejects.toThrow(/string/i)
  })
})

describe('byte API for fileHandlers', () => {
  it('getBytes returns the raw bytes of the active file', async () => {
    const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'canv-bytes-'))
    const filePath = path.join(dir, 'x.pdf')
    fs.writeFileSync(filePath, Buffer.from([0x25, 0x50, 0x44, 0x46]))
    const rt = new ExtensionRuntime()
    rt._registerForTest({
      id: 'ext',
      manifest: { id: 'ext', capabilities: [], contributions: [{ type: 'fileHandler', extensions: ['.pdf'], mode: 'viewer', entry: 'p.html', id: 'main' }] },
      extensionDir: dir,
      webContentsId: 1,
    })
    const host = { getActiveFileFor: () => ({ absPath: filePath, mode: 'viewer' }) }
    const handlers = createActiveDocHandlers({ runtime: rt, host })
    const buf = await handlers['canvExt:activeDoc.getBytes']({ sender: { id: 1 } })
    expect(Buffer.isBuffer(buf) ? buf : Buffer.from(buf)).toEqual(Buffer.from([0x25, 0x50, 0x44, 0x46]))
  })

  it('setBytes rejects when fileHandler mode is "viewer"', async () => {
    const rt = new ExtensionRuntime()
    rt._registerForTest({
      id: 'ext',
      manifest: { id: 'ext', capabilities: [], contributions: [{ type: 'fileHandler', extensions: ['.pdf'], mode: 'viewer', entry: 'p.html', id: 'main' }] },
      extensionDir: '/tmp',
      webContentsId: 1,
    })
    const host = { getActiveFileFor: () => ({ absPath: '/tmp/x.pdf', mode: 'viewer' }) }
    const handlers = createActiveDocHandlers({ runtime: rt, host })
    await expect(handlers['canvExt:activeDoc.setBytes']({ sender: { id: 1 } }, Buffer.from([0]))).rejects.toThrow(/read-only/i)
  })

  it('setBytes writes when mode is "editor"', async () => {
    const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'canv-bytes-'))
    const filePath = path.join(dir, 'x.pdf')
    fs.writeFileSync(filePath, '')
    const rt = new ExtensionRuntime()
    rt._registerForTest({
      id: 'ext',
      manifest: { id: 'ext', capabilities: [], contributions: [{ type: 'fileHandler', extensions: ['.pdf'], mode: 'editor', entry: 'p.html', id: 'main' }] },
      extensionDir: dir,
      webContentsId: 1,
    })
    const host = { getActiveFileFor: () => ({ absPath: filePath, mode: 'editor' }) }
    const handlers = createActiveDocHandlers({ runtime: rt, host })
    await handlers['canvExt:activeDoc.setBytes']({ sender: { id: 1 } }, Buffer.from('hello'))
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello')
  })

  it('throws when there is no active file for this extension', async () => {
    const rt = new ExtensionRuntime()
    rt._registerForTest({
      id: 'ext',
      manifest: { id: 'ext', capabilities: [], contributions: [{ type: 'fileHandler', extensions: ['.pdf'], mode: 'viewer', entry: 'p.html', id: 'main' }] },
      extensionDir: '/tmp',
      webContentsId: 1,
    })
    const host = { getActiveFileFor: () => null }
    const handlers = createActiveDocHandlers({ runtime: rt, host })
    await expect(handlers['canvExt:activeDoc.getBytes']({ sender: { id: 1 } })).rejects.toThrow(/no active file/i)
  })
})
