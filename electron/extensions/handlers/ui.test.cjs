const { ExtensionRuntime } = require('../runtime.cjs')
const { createUiHandlers } = require('./ui.cjs')
const { CapabilityError } = require('../capability.cjs')

function setup({ caps = [] } = {}) {
  const rt = new ExtensionRuntime()
  rt._registerForTest({
    id: 'ext', manifest: { id: 'ext', capabilities: caps },
    extensionDir: '/tmp/ext', webContentsId: 1,
  })
  const host = {
    notifyToMainWindow: (msg, kind, extensionId) => { host.lastNotify = { msg, kind, extensionId } },
    showConfirmDialog: async (msg) => { host.lastConfirm = msg; return host.confirmResult ?? true },
    writeClipboard:    (text) => { host.lastClipboard = text },
  }
  return { rt, host, event: { sender: { id: 1 } }, handlers: createUiHandlers({ runtime: rt, host }) }
}

describe('ui handlers', () => {
  it('notify requires notify capability', async () => {
    const { handlers, event } = setup({ caps: [] })
    await expect(handlers['canvExt:ui.notify'](event, 'hello', 'info'))
      .rejects.toBeInstanceOf(CapabilityError)
  })
  it('notify forwards to host with extension id', async () => {
    const { handlers, host, event } = setup({ caps: ['notify'] })
    await handlers['canvExt:ui.notify'](event, 'hello', 'warn')
    expect(host.lastNotify).toEqual({ msg: 'hello', kind: 'warn', extensionId: 'ext' })
  })
  it('notify rejects unknown kind', async () => {
    const { handlers, event } = setup({ caps: ['notify'] })
    await expect(handlers['canvExt:ui.notify'](event, 'hi', 'rave')).rejects.toThrow(/kind/i)
  })
  it('confirm requires ui capability', async () => {
    const { handlers, event } = setup({ caps: [] })
    await expect(handlers['canvExt:ui.confirm'](event, 'sure?')).rejects.toBeInstanceOf(CapabilityError)
  })
  it('confirm forwards and returns boolean', async () => {
    const { handlers, host, event } = setup({ caps: ['ui'] })
    host.confirmResult = false
    await expect(handlers['canvExt:ui.confirm'](event, 'sure?')).resolves.toBe(false)
    expect(host.lastConfirm).toBe('sure?')
  })
  it('copyToClipboard requires ui capability', async () => {
    const { handlers, event } = setup({ caps: [] })
    await expect(handlers['canvExt:ui.copyToClipboard'](event, 'x')).rejects.toBeInstanceOf(CapabilityError)
  })
  it('copyToClipboard writes via host', async () => {
    const { handlers, host, event } = setup({ caps: ['ui'] })
    await handlers['canvExt:ui.copyToClipboard'](event, 'hello')
    expect(host.lastClipboard).toBe('hello')
  })
})
