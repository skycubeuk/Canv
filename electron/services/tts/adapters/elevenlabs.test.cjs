'use strict'
const { elevenlabsAdapter } = require('./elevenlabs.cjs')
const { getTtsAdapter } = require('./index.cjs')

function okAudio(bytes) {
  return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
}

describe('elevenlabsAdapter.synthesize', () => {
  it('makes one request under the limit and returns the audio buffer', async () => {
    const calls = []
    const fetchImpl = async (url, init) => { calls.push({ url, init }); return okAudio(Buffer.from('AUDIO')) }
    const out = await elevenlabsAdapter.synthesize({ apiKey: 'k', voiceId: 'v1', modelId: 'eleven_multilingual_v2', text: 'Hello.', fetchImpl })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://api.elevenlabs.io/v1/text-to-speech/v1?output_format=mp3_44100_128')
    expect(calls[0].init.headers['xi-api-key']).toBe('k')
    expect(JSON.parse(calls[0].init.body).text).toBe('Hello.')
    expect(out.bytes.toString()).toBe('AUDIO')
    expect(out.characters).toBe(6)
  })

  it('chunks long text and concatenates buffers, wiring previous_text/next_text', async () => {
    const bodies = []
    const fetchImpl = async (_url, init) => { bodies.push(JSON.parse(init.body)); return okAudio(Buffer.from('X')) }
    const out = await elevenlabsAdapter.synthesize({ apiKey: 'k', voiceId: 'v1', modelId: 'm', text: 'AAAA. BBBB. CCCC.', fetchImpl, charLimit: 6 })
    expect(bodies.length).toBeGreaterThan(1)
    expect(bodies[0].previous_text).toBeUndefined()
    expect(bodies[1].previous_text).toBe(bodies[0].text)
    expect(bodies[bodies.length - 1].next_text).toBeUndefined()
    expect(out.bytes.toString()).toBe('X'.repeat(bodies.length))
  })

  it('maps an ElevenLabs error body to a clean message with status', async () => {
    const fetchImpl = async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ detail: { message: 'Invalid API key' } }) })
    await expect(elevenlabsAdapter.synthesize({ apiKey: 'bad', voiceId: 'v1', modelId: 'm', text: 'hi', fetchImpl }))
      .rejects.toMatchObject({ status: 401, message: expect.stringContaining('Invalid API key') })
  })

  it('throws on empty text', async () => {
    await expect(elevenlabsAdapter.synthesize({ apiKey: 'k', voiceId: 'v', modelId: 'm', text: '   ', fetchImpl: async () => okAudio(Buffer.from('')) }))
      .rejects.toThrow(/no text/i)
  })

  it('listVoices maps the v2/voices payload', async () => {
    const fetchImpl = async (url, init) => {
      expect(url).toBe('https://api.elevenlabs.io/v2/voices')
      expect(init.headers['xi-api-key']).toBe('k')
      return { ok: true, status: 200, json: async () => ({ voices: [{ voice_id: 'v1', name: 'Rachel' }] }) }
    }
    expect(await elevenlabsAdapter.listVoices('k', fetchImpl)).toEqual([{ voiceId: 'v1', name: 'Rachel' }])
  })
})

describe('getTtsAdapter', () => {
  it('returns the ElevenLabs adapter by id and by default', () => {
    expect(getTtsAdapter('elevenlabs').id).toBe('elevenlabs')
    expect(getTtsAdapter(undefined).id).toBe('elevenlabs')
  })
  it('throws on an unknown provider', () => {
    expect(() => getTtsAdapter('nope')).toThrow(/unknown tts provider/i)
  })
})
