'use strict'

// Integration tests for the canvFS:readFile / canvFS:writeFile handler bodies,
// exercised via the extracted services/canvfs.cjs helpers. Covers:
//   - CRLF + BOM round-trip byte preservation
//   - Windows-1252 (invalid UTF-8) refusal
//   - Oversize refusal (no read of the file body)
//   - LF round-trip byte preservation

const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')

const { canvFSReadFile, canvFSWriteFile } = require('./services/canvfs.cjs')

// Minimal stand-ins for the helpers main.cjs injects. Real `safeResolve`
// is exercised by serve-folder.test.cjs; this version just blocks the most
// obvious escapes so the test harness behaves like the production path.
function safeResolve(root, rel) {
  if (typeof rel !== 'string') throw new Error('invalid path')
  if (rel.includes('\0')) throw new Error('invalid path')
  if (rel.startsWith('/') || rel.startsWith('\\') || /^[a-zA-Z]:/.test(rel)) {
    throw new Error('absolute paths not allowed')
  }
  const normalized = rel.replace(/\\/g, '/').replace(/^\.\/+/, '')
  if (normalized.split('/').some((seg) => seg === '..')) {
    throw new Error('parent traversal not allowed')
  }
  const abs = path.resolve(root, normalized)
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    throw new Error('path escape')
  }
  return abs
}

// The tests only touch .md, which is unconditionally allowed by main.cjs's
// PUBLIC_EXTS set. Keeping this permissive avoids pulling extension-claim
// state into the test fixture.
function isAllowedExt(_rel, abs) {
  return path.extname(abs).toLowerCase() === '.md'
}

const deps = { safeResolve, isAllowedExt }

describe('canvFS read/write round-trip', () => {
  let root

  beforeEach(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'canvfs-test-'))
  })

  afterEach(async () => {
    await fsp.rm(root, { recursive: true, force: true })
  })

  it('round-trips a CRLF+BOM UTF-8 file with exact byte preservation', async () => {
    const original = Buffer.concat([
      Buffer.from([0xEF, 0xBB, 0xBF]),
      Buffer.from('Hello\r\nWorld\r\n', 'utf8'),
    ])
    await fsp.writeFile(path.join(root, 'a.md'), original)

    const r = await canvFSReadFile(root, 'a.md', deps)
    expect(r.ok).toBe(true)
    expect(r.eol).toBe('crlf')
    expect(r.bom).toBe(true)
    expect(r.content).toBe('Hello\nWorld\n')

    // Modify a single character; the rest of the file should round-trip byte-exact.
    const modified = 'Jello\nWorld\n'
    await canvFSWriteFile(root, 'a.md', modified, r.mtimeMs, { eol: 'crlf', bom: true }, deps)

    const after = await fsp.readFile(path.join(root, 'a.md'))
    const expected = Buffer.concat([
      Buffer.from([0xEF, 0xBB, 0xBF]),
      Buffer.from('Jello\r\nWorld\r\n', 'utf8'),
    ])
    expect(after.equals(expected)).toBe(true)

    // The difference between original and after must be confined to the single
    // modified byte ('H' → 'J' at index 3, just past the BOM).
    expect(after.length).toBe(original.length)
    const diffs = []
    for (let i = 0; i < after.length; i++) {
      if (after[i] !== original[i]) diffs.push(i)
    }
    expect(diffs).toEqual([3])
    expect(original[3]).toBe(0x48) // 'H'
    expect(after[3]).toBe(0x4A)    // 'J'
  })

  it('refuses a Windows-1252 file with error: not-utf8', async () => {
    // 0x92 is the curly-apostrophe in CP-1252 but a continuation byte in UTF-8,
    // which makes the sequence invalid UTF-8 and a deterministic decoder failure.
    const bytes = Buffer.from([0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x20, 0x92, 0x73, 0x0A])
    await fsp.writeFile(path.join(root, 'cp1252.md'), bytes)

    const r = await canvFSReadFile(root, 'cp1252.md', deps)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('not-utf8')
    expect(r.size).toBe(bytes.length)
  })

  it('refuses an oversize file with error: too-large (no read)', async () => {
    const p = path.join(root, 'big.md')
    const fd = await fsp.open(p, 'w')
    try {
      // Sparse-truncate so we don't actually allocate 11 MB.
      await fd.truncate(11 * 1024 * 1024)
    } finally {
      await fd.close()
    }

    const r = await canvFSReadFile(root, 'big.md', deps)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('too-large')
    expect(r.size).toBe(11 * 1024 * 1024)
  })

  it('round-trips an LF-only file with exact bytes when {eol: lf, bom: false}', async () => {
    await fsp.writeFile(path.join(root, 'lf.md'), 'one\ntwo\n', 'utf8')
    const r = await canvFSReadFile(root, 'lf.md', deps)
    expect(r.ok).toBe(true)
    expect(r.eol).toBe('lf')
    expect(r.bom).toBe(false)
    expect(r.content).toBe('one\ntwo\n')

    await canvFSWriteFile(root, 'lf.md', 'one\nTHREE\n', r.mtimeMs, { eol: 'lf', bom: false }, deps)

    const after = await fsp.readFile(path.join(root, 'lf.md'))
    expect(after.equals(Buffer.from('one\nTHREE\n', 'utf8'))).toBe(true)
  })
})
