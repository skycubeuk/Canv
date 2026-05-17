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
