const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { readDefaults, writeDefault } = require('./file-handler-defaults.cjs')

function mkWs() { return fs.mkdtempSync(path.join(os.tmpdir(), 'canv-fhd-')) }

describe('file-handler defaults', () => {
  it('returns {} when the file does not exist', () => {
    expect(readDefaults(mkWs())).toEqual({})
  })
  it('round-trips a default through write + read', () => {
    const ws = mkWs()
    writeDefault(ws, '.pdf', 'pdf-viewer')
    expect(readDefaults(ws)).toEqual({ '.pdf': 'pdf-viewer' })
  })
  it('overwrites an existing default', () => {
    const ws = mkWs()
    writeDefault(ws, '.pdf', 'pdf-viewer')
    writeDefault(ws, '.pdf', 'pdf-alt')
    expect(readDefaults(ws)).toEqual({ '.pdf': 'pdf-alt' })
  })
  it('clears a default when value is null', () => {
    const ws = mkWs()
    writeDefault(ws, '.pdf', 'pdf-viewer')
    writeDefault(ws, '.pdf', null)
    expect(readDefaults(ws)).toEqual({})
  })
  it('tolerates malformed JSON by returning {}', () => {
    const ws = mkWs()
    const dir = path.join(ws, '.canv', 'extensions')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'file-handlers.json'), 'not json')
    expect(readDefaults(ws)).toEqual({})
  })
})
