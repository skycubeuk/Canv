'use strict'
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const EMPTY = () => ({ version: 1, recordings: [] })

async function readIndex(dir) {
  const p = path.join(dir, 'index.json')
  try {
    const parsed = JSON.parse(await fsp.readFile(p, 'utf8'))
    if (!parsed || !Array.isArray(parsed.recordings)) return EMPTY()
    return { version: 1, recordings: parsed.recordings }
  } catch {
    return EMPTY()
  }
}

async function writeIndex(dir, index) {
  await fsp.mkdir(dir, { recursive: true })
  const p = path.join(dir, 'index.json')
  const tmp = p + '.tmp'
  await fsp.writeFile(tmp, JSON.stringify(index, null, 2), 'utf8')
  await fsp.rename(tmp, p)
  return index
}

async function writeRecording(dir, id, bytes) {
  await fsp.mkdir(dir, { recursive: true })
  const p = path.join(dir, `${id}.mp3`)
  const tmp = p + '.tmp'
  await fsp.writeFile(tmp, bytes)
  await fsp.rename(tmp, p)
  return p
}

async function appendRow(dir, record) {
  const index = await readIndex(dir)
  index.recordings = [record, ...index.recordings.filter((r) => r.id !== record.id)]
  return writeIndex(dir, index)
}

async function deleteRecording(dir, id) {
  const index = await readIndex(dir)
  index.recordings = index.recordings.filter((r) => r.id !== id)
  try { fs.unlinkSync(path.join(dir, `${id}.mp3`)) } catch { /* already gone */ }
  return writeIndex(dir, index)
}

async function setDuration(dir, id, durationMs) {
  const index = await readIndex(dir)
  const row = index.recordings.find((r) => r.id === id)
  if (row) row.durationMs = durationMs
  return writeIndex(dir, index)
}

module.exports = { readIndex, writeIndex, writeRecording, appendRow, deleteRecording, setDuration }
