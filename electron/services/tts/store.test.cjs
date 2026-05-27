'use strict'
const fsp = require('node:fs/promises')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { writeRecording, readIndex, appendRow, deleteRecording, setDuration, recordingFilePath } = require('./store.cjs')

async function tmpDir() { return fsp.mkdtemp(path.join(os.tmpdir(), 'tts-')) }

describe('recordings store', () => {
  it('writes an mp3 and appends an index row, returning the index', async () => {
    const dir = await tmpDir()
    await writeRecording(dir, 'rec_1', Buffer.from('MP3'))
    const rec = { id: 'rec_1', label: 'hi', file: 'rec_1.mp3', createdAt: 1, source: { path: 'a.md', kind: 'selection' }, voiceId: 'v', voiceName: 'Rachel', modelId: 'm', characters: 2, durationMs: null, origin: 'user' }
    const index = await appendRow(dir, rec)
    expect(fs.existsSync(path.join(dir, 'rec_1.mp3'))).toBe(true)
    expect(index.recordings).toHaveLength(1)
    expect(index.recordings[0].id).toBe('rec_1')
    expect((await readIndex(dir)).recordings[0].label).toBe('hi')
  })

  it('delete removes both the row and the file', async () => {
    const dir = await tmpDir()
    await writeRecording(dir, 'rec_1', Buffer.from('MP3'))
    await appendRow(dir, { id: 'rec_1', file: 'rec_1.mp3', label: '', createdAt: 1, source: { path: null, kind: 'document' }, voiceId: 'v', voiceName: '', modelId: 'm', characters: 0, durationMs: null, origin: 'user' })
    const index = await deleteRecording(dir, 'rec_1')
    expect(index.recordings).toHaveLength(0)
    expect(fs.existsSync(path.join(dir, 'rec_1.mp3'))).toBe(false)
  })

  it('readIndex tolerates a missing or corrupt index', async () => {
    const dir = await tmpDir()
    expect(await readIndex(dir)).toEqual({ version: 1, recordings: [] })
    await fsp.writeFile(path.join(dir, 'index.json'), 'not json', 'utf8')
    expect((await readIndex(dir)).recordings).toEqual([])
  })

  it('setDuration backfills durationMs on a row', async () => {
    const dir = await tmpDir()
    await appendRow(dir, { id: 'rec_1', file: 'rec_1.mp3', label: '', createdAt: 1, source: { path: null, kind: 'document' }, voiceId: 'v', voiceName: '', modelId: 'm', characters: 0, durationMs: null, origin: 'user' })
    const index = await setDuration(dir, 'rec_1', 4200)
    expect(index.recordings[0].durationMs).toBe(4200)
  })

  it('recordingFilePath accepts a plain filename and rejects traversal', () => {
    const dir = '/ws/.canv/recordings'
    expect(require('path').normalize(recordingFilePath(dir, 'rec_ab12.mp3'))).toBe(require('path').normalize('/ws/.canv/recordings/rec_ab12.mp3'))
    for (const bad of ['../config.json', 'sub/../../../passwd', '/etc/passwd', '..', '', 'a/../../b']) {
      expect(() => recordingFilePath(dir, bad)).toThrow(/invalid recording file/)
    }
  })
})
