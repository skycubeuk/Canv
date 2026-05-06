import { describe, it, expect } from 'vitest'
import { validateToolPath } from './paths'

describe('validateToolPath', () => {
  it('accepts simple relative paths', () => {
    expect(validateToolPath('notes/foo.md')).toEqual({ ok: true, rel: 'notes/foo.md' })
  })

  it('accepts a single filename', () => {
    expect(validateToolPath('foo.md')).toEqual({ ok: true, rel: 'foo.md' })
  })

  it('normalises leading ./', () => {
    expect(validateToolPath('./foo.md')).toEqual({ ok: true, rel: 'foo.md' })
  })

  it('rejects absolute paths', () => {
    const r = validateToolPath('/etc/passwd')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.error).toMatch(/absolute/i)
  })

  it('rejects Windows-style absolute paths', () => {
    expect(validateToolPath('C:\\Users\\foo').ok).toBe(false)
  })

  it('rejects parent traversal', () => {
    expect(validateToolPath('../etc/passwd').ok).toBe(false)
    expect(validateToolPath('a/../../b').ok).toBe(false)
  })

  it('rejects .canv/ paths', () => {
    expect(validateToolPath('.canv/context-cache.json').ok).toBe(false)
    expect(validateToolPath('.canv').ok).toBe(false)
  })

  it('rejects empty string', () => {
    expect(validateToolPath('').ok).toBe(false)
  })

  it('rejects non-string input', () => {
    expect(validateToolPath(undefined as unknown as string).ok).toBe(false)
    expect(validateToolPath(42 as unknown as string).ok).toBe(false)
  })

  it('collapses backslashes to forward slashes', () => {
    expect(validateToolPath('a\\b\\c.md')).toEqual({ ok: true, rel: 'a/b/c.md' })
  })
})
