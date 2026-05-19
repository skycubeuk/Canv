const { ExtensionRuntime } = require('../runtime.cjs')
const { createEventsHandlers, capabilityForEventType } = require('./events.cjs')
const { CapabilityError } = require('../capability.cjs')

describe('capabilityForEventType', () => {
  it('maps each event type to its capability', () => {
    expect(capabilityForEventType('activeDocChanged')).toBe('events.docChanged')
    expect(capabilityForEventType('selectionChanged')).toBe('events.selectionChanged')
    expect(capabilityForEventType('docSaved')).toBe('events.docSaved')
    expect(capabilityForEventType('workspaceChanged')).toBe('events.workspaceChanged')
  })
  it('returns undefined for unknown event types', () => {
    expect(capabilityForEventType('badEvent')).toBeUndefined()
  })
  it('returns null for activeFile.changed (no capability needed)', () => {
    expect(capabilityForEventType('activeFile.changed')).toBe(null)
  })
})

function setup({ caps = [] } = {}) {
  const rt = new ExtensionRuntime()
  rt._registerForTest({
    id: 'ext', manifest: { id: 'ext', capabilities: caps },
    extensionDir: '/tmp/ext', webContentsId: 1,
  })
  return { rt, event: { sender: { id: 1 } }, handlers: createEventsHandlers({ runtime: rt }) }
}

describe('events handlers', () => {
  it('subscribe records subscription when capability declared', async () => {
    const { rt, event, handlers } = setup({ caps: ['events.docChanged'] })
    await handlers['canvExt:events.subscribe'](event, 'activeDocChanged')
    expect(rt.subscriptionsFor('ext')).toEqual(['activeDocChanged'])
  })
  it('subscribe rejects when capability missing', async () => {
    const { handlers, event } = setup({ caps: [] })
    await expect(handlers['canvExt:events.subscribe'](event, 'activeDocChanged'))
      .rejects.toBeInstanceOf(CapabilityError)
  })
  it('subscribe rejects unknown event type', async () => {
    const { handlers, event } = setup({ caps: ['events.docChanged'] })
    await expect(handlers['canvExt:events.subscribe'](event, 'fakeEvent'))
      .rejects.toThrow(/unknown event/i)
  })
  it('unsubscribe removes subscription', async () => {
    const { rt, event, handlers } = setup({ caps: ['events.docSaved'] })
    await handlers['canvExt:events.subscribe'](event, 'docSaved')
    await handlers['canvExt:events.unsubscribe'](event, 'docSaved')
    expect(rt.subscriptionsFor('ext')).toEqual([])
  })
})
