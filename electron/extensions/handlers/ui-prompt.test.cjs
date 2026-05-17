const { ExtensionRuntime } = require('../runtime.cjs')
const { createUiPromptHandlers } = require('./ui-prompt.cjs')
const { CapabilityError } = require('../capability.cjs')

function setup({ caps = ['ui'] } = {}) {
  const rt = new ExtensionRuntime()
  rt._registerForTest({
    id: 'ext', manifest: { id: 'ext', capabilities: caps },
    extensionDir: '/tmp/ext', webContentsId: 1,
  })
  const requests = []
  const host = {
    showPrompt: async (req) => { requests.push(req); return host._reply ?? null }
  }
  return { rt, host, requests, event: { sender: { id: 1 } },
    handlers: createUiPromptHandlers({ runtime: rt, host }) }
}

describe('ui prompt handlers', () => {
  it('quickPick requires ui capability', async () => {
    const { handlers, event } = setup({ caps: [] })
    await expect(handlers['canvExt:ui.quickPick'](event, [{ label: 'a', value: 1 }]))
      .rejects.toBeInstanceOf(CapabilityError)
  })
  it('quickPick forwards items + opts to host and returns chosen value', async () => {
    const { handlers, host, event } = setup()
    host._reply = { value: 'B' }
    const r = await handlers['canvExt:ui.quickPick'](event, [{ label: 'A', value: 'A' }, { label: 'B', value: 'B' }], { placeholder: 'pick one' })
    expect(r).toBe('B')
  })
  it('quickPick returns null when user cancels', async () => {
    const { handlers, host, event } = setup()
    host._reply = null
    const r = await handlers['canvExt:ui.quickPick'](event, [{ label: 'a', value: 1 }])
    expect(r).toBe(null)
  })
  it('input requires ui capability', async () => {
    const { handlers, event } = setup({ caps: [] })
    await expect(handlers['canvExt:ui.input'](event, { prompt: 'name?' }))
      .rejects.toBeInstanceOf(CapabilityError)
  })
  it('input forwards prompt + opts and returns typed string', async () => {
    const { handlers, host, event } = setup()
    host._reply = { value: 'Graeme' }
    const r = await handlers['canvExt:ui.input'](event, { prompt: 'name?', placeholder: 'your name' })
    expect(r).toBe('Graeme')
  })
  it('input returns null when user cancels', async () => {
    const { handlers, host, event } = setup()
    host._reply = null
    const r = await handlers['canvExt:ui.input'](event, { prompt: 'x' })
    expect(r).toBe(null)
  })
  it('rejects malformed quickPick items (not an array)', async () => {
    const { handlers, event } = setup()
    await expect(handlers['canvExt:ui.quickPick'](event, 'not an array'))
      .rejects.toThrow(/array/i)
  })
})
