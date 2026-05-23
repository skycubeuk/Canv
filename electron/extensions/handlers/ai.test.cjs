const { ExtensionRuntime } = require('../runtime.cjs')
const { createAiHandlers } = require('./ai.cjs')
const { CapabilityError } = require('../capability.cjs')

function setup({ caps = ['ai'], hostResponse = { text: 'hello', usage: { in: 5, out: 2 } } } = {}) {
  const rt = new ExtensionRuntime()
  rt._registerForTest({
    id: 'ext', manifest: { id: 'ext', capabilities: caps },
    extensionDir: '/tmp/ext', webContentsId: 1,
  })
  const calls = []
  const host = {
    askAI: async (params) => { calls.push(params); return hostResponse },
  }
  return { rt, calls, event: { sender: { id: 1 } }, handlers: createAiHandlers({ runtime: rt, host }) }
}

describe('ai handlers', () => {
  it('requires ai capability', async () => {
    const { handlers, event } = setup({ caps: [] })
    await expect(handlers['canvExt:ai.ask'](event, 'hello'))
      .rejects.toBeInstanceOf(CapabilityError)
  })
  it('forwards prompt + opts to host.askAI', async () => {
    const { handlers, calls, event } = setup()
    await handlers['canvExt:ai.ask'](event, 'hello', { system: 'you are a bot', maxTokens: 100, profileId: 'p1' })
    expect(calls[0]).toEqual({
      extensionId: 'ext', prompt: 'hello', system: 'you are a bot',
      maxTokens: 100, profileId: 'p1',
    })
  })
  it('returns { text, usage } from host', async () => {
    const { handlers, event } = setup()
    const r = await handlers['canvExt:ai.ask'](event, 'hi')
    expect(r.text).toBe('hello')
    expect(r.usage).toEqual({ in: 5, out: 2 })
  })
  it('rejects non-string prompt', async () => {
    const { handlers, event } = setup()
    await expect(handlers['canvExt:ai.ask'](event, 42)).rejects.toThrow(/string/i)
  })
  it('clamps maxTokens to a sane upper bound', async () => {
    const { handlers, calls, event } = setup()
    await handlers['canvExt:ai.ask'](event, 'hi', { maxTokens: 999999 })
    expect(calls[0].maxTokens).toBeLessThanOrEqual(8192)
  })
})
