const { ExtensionRuntime } = require('../runtime.cjs')
const { createStorageHandlers } = require('./storage.cjs')
const { CapabilityError } = require('../capability.cjs')

function setup({ caps = ['storage'] } = {}) {
  const rt = new ExtensionRuntime()
  rt._registerForTest({
    id: 'ext', manifest: { id: 'ext', capabilities: caps },
    extensionDir: '/tmp/ext', webContentsId: 1,
  })
  return { rt, event: { sender: { id: 1 } }, handlers: createStorageHandlers({ runtime: rt }) }
}

describe('storage handlers', () => {
  it('set/get round-trips a value', async () => {
    const { handlers, event } = setup()
    await handlers['canvExt:storage.set'](event, 'k', { n: 1 })
    await expect(handlers['canvExt:storage.get'](event, 'k')).resolves.toEqual({ n: 1 })
  })
  it('keys lists all stored keys', async () => {
    const { handlers, event } = setup()
    await handlers['canvExt:storage.set'](event, 'a', 1)
    await handlers['canvExt:storage.set'](event, 'b', 2)
    await expect(handlers['canvExt:storage.keys'](event)).resolves.toEqual(expect.arrayContaining(['a', 'b']))
  })
  it('delete removes a key', async () => {
    const { handlers, event } = setup()
    await handlers['canvExt:storage.set'](event, 'x', 1)
    await handlers['canvExt:storage.delete'](event, 'x')
    await expect(handlers['canvExt:storage.get'](event, 'x')).resolves.toBe(undefined)
  })
  it('requires storage capability', async () => {
    const { handlers, event } = setup({ caps: [] })
    await expect(handlers['canvExt:storage.get'](event, 'x')).rejects.toBeInstanceOf(CapabilityError)
  })
  it('rejects non-string keys', async () => {
    const { handlers, event } = setup()
    await expect(handlers['canvExt:storage.set'](event, 42, 1)).rejects.toThrow(/string/i)
  })
  it('rejects values that contain functions (non-serialisable)', async () => {
    const { handlers, event } = setup()
    await expect(handlers['canvExt:storage.set'](event, 'k', () => {}))
      .rejects.toThrow(/serializ/i)
  })
})
