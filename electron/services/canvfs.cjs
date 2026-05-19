'use strict'

// Local-workspace implementations of canvFS:readFile and canvFS:writeFile.
// Extracted from main.cjs so the round-trip semantics (CRLF/BOM preservation,
// non-UTF-8 refusal, oversize refusal) can be covered by integration tests
// without booting Electron.
//
// Callers (main.cjs) supply `safeResolve` and `isAllowedExt` so this module
// stays free of the broader workspace/extension closure state. The remote-SSH
// branch lives in main.cjs — this module is local-only.

const fsp = require('node:fs/promises')
const path = require('node:path')
const { MAX_OPEN_BYTES } = require('./fs-limits.cjs')

/**
 * @param {string} root        absolute workspace root
 * @param {string} rel         workspace-relative path
 * @param {object} deps
 * @param {(root: string, rel: string) => string} deps.safeResolve
 * @param {(rel: string, abs: string) => boolean} deps.isAllowedExt
 */
async function canvFSReadFile(root, rel, deps) {
  const { safeResolve, isAllowedExt } = deps
  const abs = safeResolve(root, rel)
  const stat = await fsp.stat(abs)
  if (!stat.isFile()) throw new Error('not a file')
  if (stat.size > MAX_OPEN_BYTES) {
    return { ok: false, error: 'too-large', size: stat.size, mtimeMs: stat.mtimeMs }
  }
  if (!isAllowedExt(rel, abs)) throw new Error('binary or unsupported file type')

  let buf = await fsp.readFile(abs)
  let bom = false
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    bom = true
    buf = buf.subarray(3)
  }

  let content
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return { ok: false, error: 'not-utf8', size: stat.size, mtimeMs: stat.mtimeMs }
  }

  // Scan up to the first 64K decoded chars for CRLF. Lone-\r (classic Mac)
  // line endings are not detected — out of scope.
  const scan = content.slice(0, 65536)
  const eol = scan.includes('\r\n') ? 'crlf' : 'lf'
  const normalised = eol === 'crlf' ? content.replace(/\r\n/g, '\n') : content

  return { ok: true, content: normalised, mtimeMs: stat.mtimeMs, eol, bom, size: stat.size }
}

/**
 * @param {string} root
 * @param {string} rel
 * @param {string} content                  LF-normalised editor content
 * @param {number|undefined} expectedMtimeMs  optimistic-concurrency check
 * @param {{eol?: 'lf'|'crlf', bom?: boolean}|undefined} opts
 * @param {object} deps
 * @param {(root: string, rel: string) => string} deps.safeResolve
 * @param {(rel: string, abs: string) => boolean} deps.isAllowedExt
 */
async function canvFSWriteFile(root, rel, content, expectedMtimeMs, opts, deps) {
  const { safeResolve, isAllowedExt } = deps
  const abs = safeResolve(root, rel)
  if (!isAllowedExt(rel, abs)) throw new Error('unsupported file type')
  if (typeof content !== 'string') throw new Error('invalid content')

  const wantEol = opts && opts.eol === 'crlf' ? 'crlf' : 'lf'
  const wantBom = !!(opts && opts.bom)

  const out = wantEol === 'crlf' ? content.replace(/\n/g, '\r\n') : content
  let buffer = Buffer.from(out, 'utf8')
  if (wantBom) buffer = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), buffer])
  if (buffer.byteLength > MAX_OPEN_BYTES) throw new Error('content too large')

  if (typeof expectedMtimeMs === 'number') {
    const stat = await fsp.stat(abs).catch(() => null)
    if (stat && Math.abs(stat.mtimeMs - expectedMtimeMs) > 1) {
      const err = new Error('stale write')
      err.code = 'STALE'
      throw err
    }
  }
  await fsp.mkdir(path.dirname(abs), { recursive: true })
  await fsp.writeFile(abs, buffer)
  const stat = await fsp.stat(abs)
  return { mtimeMs: stat.mtimeMs }
}

module.exports = { canvFSReadFile, canvFSWriteFile }
