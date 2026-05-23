const { ExtensionRuntime } = require('../runtime.cjs')
const { createWorkspaceHandlers } = require('./workspace.cjs')
const { CapabilityError } = require('../capability.cjs')

function setup({ caps = [] } = {}) {
  const rt = new ExtensionRuntime()
  rt._registerForTest({
    id: 'ext', manifest: { id: 'ext', capabilities: caps },
    extensionDir: '/tmp/ext', webContentsId: 1,
  })
  const host = {
    getWorkspaceRoot:   async () => '/ws',
    listWorkspace:      async (g) => g ? [`hit:${g}`] : ['a.md', 'b.md'],
    readWorkspaceText:  async (rel) => `contents:${rel}`,
  }
  return { rt, host, event: { sender: { id: 1 } }, handlers: createWorkspaceHandlers({ runtime: rt, host }) }
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
})
