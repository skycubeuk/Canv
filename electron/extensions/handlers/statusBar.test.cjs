const { ExtensionRuntime } = require('../runtime.cjs')
const { createStatusBarHandlers } = require('./statusBar.cjs')
const { CapabilityError } = require('../capability.cjs')

function setup({ caps = ['ui'] } = {}) {
  const rt = new ExtensionRuntime()
  rt._registerForTest({
    id: 'ext',
    manifest: {
      id: 'ext', capabilities: caps,
      contributions: [
        { type: 'statusBar', id: 'total', alignment: 'right', priority: 30, text: 'initial' },
      ],
    },
    extensionDir: '/tmp/ext', webContentsId: 1,
  })
  const events = []
  const host = { onStatusBarItemUpdated: (id, item) => events.push({ id, item }) }
  return { rt, host, events, event: { sender: { id: 1 } },
    handlers: createStatusBarHandlers({ runtime: rt, host }) }
}

describe('statusBar handlers', () => {
  it('setStatusBarItem requires ui capability', async () => {
    const { handlers, event } = setup({ caps: [] })
    await expect(handlers['canvExt:ui.setStatusBarItem'](event, 'total', { text: 'x' }))
      .rejects.toBeInstanceOf(CapabilityError)
  })
  it('rejects unknown item id (not in manifest)', async () => {
    const { handlers, event } = setup()
    await expect(handlers['canvExt:ui.setStatusBarItem'](event, 'nope', { text: 'x' }))
      .rejects.toThrow(/unknown.*statusBar/i)
  })
  it('forwards partial updates to host', async () => {
    const { handlers, events, event } = setup()
    await handlers['canvExt:ui.setStatusBarItem'](event, 'total', { text: '142 words', tooltip: 'updated' })
    expect(events).toHaveLength(1)
    expect(events[0].item).toMatchObject({ extensionId: 'ext', id: 'total', text: '142 words', tooltip: 'updated' })
  })
  it('rejects non-string text/icon/tooltip', async () => {
    const { handlers, event } = setup()
    await expect(handlers['canvExt:ui.setStatusBarItem'](event, 'total', { text: 42 })).rejects.toThrow(/string/i)
  })
})
