const { ExtensionRuntime } = require('../runtime.cjs')
const { createWorkspaceHandlers } = require('./workspace.cjs')
const { CapabilityError } = require('../capability.cjs')

function setup({ caps = [], writePaths = [] } = {}) {
  const rt = new ExtensionRuntime()
  rt._registerForTest({
    id: 'ext', manifest: { id: 'ext', capabilities: caps, writePaths },
    extensionDir: '/tmp/ext', webContentsId: 1,
  })
  const writes = []
  const host = {
    getWorkspaceRoot:   async () => '/ws',
    listWorkspace:      async (g) => g ? [`hit:${g}`] : ['a.md', 'b.md'],
    readWorkspaceText:  async (rel) => `contents:${rel}`,
    writeWorkspaceText: async (rel, text) => { writes.push({ rel, text }) },
  }
  return { rt, host, writes, event: { sender: { id: 1 } }, handlers: createWorkspaceHandlers({ runtime: rt, host }) }
}

describe('workspace handlers', () => {
  it('getRoot is always allowed', async () => {
    const { handlers, event } = setup({ caps: [] })
    await expect(handlers['canvExt:workspace.getRoot'](event)).resolves.toBe('/ws')
  })
  it('list requires workspace.list', async () => {
    const { handlers, event } = setup({ caps: [] })
    await expect(handlers['canvExt:workspace.list'](event, null)).rejects.toBeInstanceOf(CapabilityError)
  })
  it('list returns host result when capability declared', async () => {
    const { handlers, event } = setup({ caps: ['workspace.list'] })
    await expect(handlers['canvExt:workspace.list'](event, null)).resolves.toEqual(['a.md', 'b.md'])
    await expect(handlers['canvExt:workspace.list'](event, '*.md')).resolves.toEqual(['hit:*.md'])
  })
  it('readText requires workspace.read', async () => {
    const { handlers, event } = setup({ caps: ['workspace.list'] })
    await expect(handlers['canvExt:workspace.readText'](event, 'a.md')).rejects.toBeInstanceOf(CapabilityError)
  })
  it('readText forwards to host when capability declared', async () => {
    const { handlers, event } = setup({ caps: ['workspace.read'] })
    await expect(handlers['canvExt:workspace.readText'](event, 'a.md')).resolves.toBe('contents:a.md')
  })
  it('readText rejects non-string path', async () => {
    const { handlers, event } = setup({ caps: ['workspace.read'] })
    await expect(handlers['canvExt:workspace.readText'](event, 42)).rejects.toThrow(/string/i)
  })

  it('writeText requires workspace.write', async () => {
    const { handlers, event } = setup({ caps: ['workspace.read'], writePaths: ['Feedback/'] })
    await expect(handlers['canvExt:workspace.writeText'](event, 'Feedback/x.md', 'hi'))
      .rejects.toBeInstanceOf(CapabilityError)
  })
  it('writeText rejects a path outside the declared writePaths', async () => {
    const { handlers, event } = setup({ caps: ['workspace.write'], writePaths: ['Feedback/'] })
    await expect(handlers['canvExt:workspace.writeText'](event, 'secrets.txt', 'hi'))
      .rejects.toThrow(/not whitelisted|writePaths/i)
  })
  it('writeText forwards to host when path is in writePaths', async () => {
    const { handlers, event, writes } = setup({ caps: ['workspace.write'], writePaths: ['Feedback/'] })
    await handlers['canvExt:workspace.writeText'](event, 'Feedback/notes.md', 'body')
    expect(writes).toEqual([{ rel: 'Feedback/notes.md', text: 'body' }])
  })
  it('writeText rejects non-string args', async () => {
    const { handlers, event } = setup({ caps: ['workspace.write'], writePaths: ['Feedback/'] })
    await expect(handlers['canvExt:workspace.writeText'](event, 42, 'x')).rejects.toThrow(/string/i)
    await expect(handlers['canvExt:workspace.writeText'](event, 'Feedback/x', 42)).rejects.toThrow(/string/i)
  })
})
