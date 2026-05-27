'use strict'
const { chunkText } = require('../chunk.cjs')

const ELEVEN_BASE = 'https://api.elevenlabs.io'
const DEFAULT_MODEL = 'eleven_multilingual_v2'
const DEFAULT_FORMAT = 'mp3_44100_128'
const CHAR_LIMIT = 10000

function parseError(status, raw) {
  let msg = raw
  try {
    const j = JSON.parse(raw)
    if (typeof j.detail === 'string') msg = j.detail
    else if (j.detail && typeof j.detail.message === 'string') msg = j.detail.message
  } catch { /* not JSON */ }
  const err = new Error(`ElevenLabs ${status}: ${msg || 'request failed'}`)
  err.status = status
  return err
}

async function synthesize({ apiKey, voiceId, modelId, text, outputFormat = DEFAULT_FORMAT, charLimit = CHAR_LIMIT, fetchImpl = globalThis.fetch, signal }) {
  if (!apiKey) throw new Error('Missing ElevenLabs API key')
  if (!voiceId) throw new Error('Missing voice')
  const chunks = chunkText(text, charLimit)
  if (chunks.length === 0) throw new Error('no text to read')

  const url = `${ELEVEN_BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`
  const parts = []
  for (let i = 0; i < chunks.length; i++) {
    const body = { text: chunks[i], model_id: modelId || DEFAULT_MODEL }
    if (i > 0) body.previous_text = chunks[i - 1]
    if (i < chunks.length - 1) body.next_text = chunks[i + 1]
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok) throw parseError(res.status, await res.text().catch(() => ''))
    parts.push(Buffer.from(await res.arrayBuffer()))
  }
  return { bytes: Buffer.concat(parts), characters: chunks.join('').length }
}

async function listVoices(apiKey, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(`${ELEVEN_BASE}/v2/voices`, { headers: { 'xi-api-key': apiKey } })
  if (!res.ok) throw new Error(`ElevenLabs voices ${res.status}`)
  const data = await res.json()
  return (data.voices || []).map((v) => ({ voiceId: v.voice_id, name: v.name }))
}

async function listModels(apiKey, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(`${ELEVEN_BASE}/v1/models`, { headers: { 'xi-api-key': apiKey } })
  if (!res.ok) throw new Error(`ElevenLabs models ${res.status}`)
  const data = await res.json()
  return (Array.isArray(data) ? data : []).filter((m) => m.can_do_text_to_speech).map((m) => ({ modelId: m.model_id, name: m.name }))
}

const elevenlabsAdapter = { id: 'elevenlabs', name: 'ElevenLabs', charLimit: CHAR_LIMIT, defaultModel: DEFAULT_MODEL, synthesize, listVoices, listModels }

module.exports = { elevenlabsAdapter, parseError, ELEVEN_BASE }
