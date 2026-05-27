'use strict'
const path = require('node:path')
const os = require('node:os')
const fsp = require('node:fs/promises')
const { createTtsService } = require('./index.cjs')

function fakeIpc() {
  const handlers = {}
  return { handle: (ch, fn) => { handlers[ch] = fn }, invoke: (ch, ...a) => handlers[ch](null, ...a), handlers }
}

describe('tts service', () => {
  let dir
  beforeEach(async () => { dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ttsvc-')) })

  function deps() {
    return { requireWorkspace: () => dir, safeResolve: (root, rel) => path.join(root, rel) }
  }

  it('generate writes a recording and returns the record', async () => {
    const ipc = fakeIpc()
    const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from('AUD').buffer })
    createTtsService({ fetchImpl }).registerIpcHandlers(ipc, deps())
    const rec = await ipc.invoke('canvTTS:generate', {
      provider: 'elevenlabs', text: 'Hello there.', voiceId: 'v1', voiceName: 'Rachel', modelId: 'eleven_multilingual_v2',
      apiKey: 'k', sourcePath: 'a.md', sourceKind: 'selection', label: 'Hello there.',
    })
    expect(rec.id).toMatch(/^rec_/)
    expect(rec.voiceName).toBe('Rachel')
    expect(rec.characters).toBe(12)
    const list = await ipc.invoke('canvTTS:list')
    expect(list).toHaveLength(1)
  })

  it('voices routes through the provider adapter', async () => {
    const ipc = fakeIpc()
    const fetchImpl = async (url, init) => {
      expect(url).toBe('https://api.elevenlabs.io/v2/voices')
      expect(init.headers['xi-api-key']).toBe('k')
      return { ok: true, status: 200, json: async () => ({ voices: [{ voice_id: 'v1', name: 'Rachel' }] }) }
    }
    createTtsService({ fetchImpl }).registerIpcHandlers(ipc, deps())
    const voices = await ipc.invoke('canvTTS:voices', 'elevenlabs', 'k')
    expect(voices).toEqual([{ voiceId: 'v1', name: 'Rachel' }])
  })

  it('delete removes the recording', async () => {
    const ipc = fakeIpc()
    const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => Buffer.from('AUD').buffer })
    createTtsService({ fetchImpl }).registerIpcHandlers(ipc, deps())
    const rec = await ipc.invoke('canvTTS:generate', { text: 'Hi.', voiceId: 'v1', voiceName: 'R', modelId: 'm', apiKey: 'k', sourcePath: null, sourceKind: 'document', label: 'doc' })
    await ipc.invoke('canvTTS:delete', rec.id)
    expect(await ipc.invoke('canvTTS:list')).toHaveLength(0)
  })
})
