'use strict'
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { globToRegExp, maxMtimeForGlobs } = require('./glob-mtime.cjs')

describe('globToRegExp', () => {
  it('matches * within a segment', () => {
    expect(globToRegExp('a/*.md').test('a/foo.md')).toBe(true)
    expect(globToRegExp('a/*.md').test('a/sub/foo.md')).toBe(false)
  })
  it('matches ** across segments', () => {
    expect(globToRegExp('a/**/*.md').test('a/sub/foo.md')).toBe(true)
    expect(globToRegExp('**/*.md').test('foo.md')).toBe(true)
  })
  it('escapes special regex chars', () => {
    expect(globToRegExp('a.b').test('a.b')).toBe(true)
    expect(globToRegExp('a.b').test('aXb')).toBe(false)
  })
})

describe('maxMtimeForGlobs', () => {
  let tmp
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'canv-glob-'))
    fs.mkdirSync(path.join(tmp, 'chapters'))
    fs.writeFileSync(path.join(tmp, 'chapters', 'a.md'), 'a')
    fs.writeFileSync(path.join(tmp, 'chapters', 'b.md'), 'b')
    fs.writeFileSync(path.join(tmp, 'notes.md'), 'n')
  })
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

  it('returns max mtime over matched files', () => {
    const m = maxMtimeForGlobs(tmp, ['chapters/*.md'])
    expect(m).toBeGreaterThan(0)
  })
  it('returns 0 when no matches', () => {
    expect(maxMtimeForGlobs(tmp, ['nothing/*.md'])).toBe(0)
  })
})
