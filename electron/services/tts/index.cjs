'use strict'
const path = require('node:path')
const crypto = require('node:crypto')
const { getTtsAdapter } = require('./adapters/index.cjs')
const store = require('./store.cjs')

const RECORDINGS_REL = path.join('.canv', 'recordings')

function newId() { return 'rec_' + crypto.randomBytes(6).toString('hex') }

/**
 * @param {object} opts
 * @param {typeof globalThis.fetch} [opts.fetchImpl] injectable for tests
 */
function createTtsService({ fetchImpl = globalThis.fetch } = {}) {
  function registerIpcHandlers(ipcMain, deps) {
    function recordingsDir() {
      const root = deps.requireWorkspace()
      return deps.safeResolve(root, RECORDINGS_REL)
    }

    // The reusable capability — built-in IPC and (future) extension surface both call this.
    // Routes provider → adapter; the adapter owns endpoint/headers/chunking/error mapping.
    async function generateRecording(params) {
      const {
        provider = 'elevenlabs', text, voiceId, voiceName = '', modelId, apiKey,
        sourcePath = null, sourceKind = 'selection', label = '',
        origin = 'user', outputFormat, signal,
      } = params
      const adapter = getTtsAdapter(provider)
      const dir = recordingsDir()
      const { bytes, characters } = await adapter.synthesize({ apiKey, voiceId, modelId, text, outputFormat, fetchImpl, signal })
      const id = newId()
      await store.writeRecording(dir, id, bytes)
      const record = {
        id, label: label || (sourceKind === 'document' ? 'Document' : text.slice(0, 60)),
        file: `${id}.mp3`, createdAt: Date.now(),
        source: { path: sourcePath, kind: sourceKind === 'document' ? 'document' : 'selection' },
        voiceId, voiceName, modelId, characters, durationMs: null, origin,
      }
      await store.appendRow(dir, record)
      return record
    }

    ipcMain.handle('canvTTS:generate', (_e, params) => generateRecording(params || {}))

    ipcMain.handle('canvTTS:list', async () => {
      try { return (await store.readIndex(recordingsDir())).recordings } catch { return [] }
    })

    ipcMain.handle('canvTTS:delete', async (_e, id) => {
      if (typeof id !== 'string') return
      try { await store.deleteRecording(recordingsDir(), id) } catch { /* no workspace */ }
    })

    ipcMain.handle('canvTTS:setDuration', async (_e, id, ms) => {
      if (typeof id !== 'string' || typeof ms !== 'number') return
      try { await store.setDuration(recordingsDir(), id, ms) } catch { /* no workspace */ }
    })

    ipcMain.handle('canvTTS:voices', (_e, provider, apiKey) => getTtsAdapter(provider).listVoices(apiKey, fetchImpl))

    ipcMain.handle('canvTTS:models', (_e, provider, apiKey) => {
      const adapter = getTtsAdapter(provider)
      return adapter.listModels ? adapter.listModels(apiKey, fetchImpl) : []
    })

    return { generateRecording }
  }

  return { registerIpcHandlers }
}

module.exports = { createTtsService, RECORDINGS_REL }
