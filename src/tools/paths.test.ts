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

  it('rejects bare .canv/', () => {
    expect(validateToolPath('.canv').ok).toBe(false)
  })

  it('accepts paths under .canv/sites/', () => {
    expect(validateToolPath('.canv/sites/timeline-a3f2/index.html'))
      .toEqual({ ok: true, rel: '.canv/sites/timeline-a3f2/index.html' })
    expect(validateToolPath('.canv/sites/x/data.json'))
      .toEqual({ ok: true, rel: '.canv/sites/x/data.json' })
  })

  it('accepts the registry file at .canv/site_index.yaml', () => {
    expect(validateToolPath('.canv/site_index.yaml'))
      .toEqual({ ok: true, rel: '.canv/site_index.yaml' })
  })

  it('still rejects other paths under .canv/', () => {
    expect(validateToolPath('.canv/context-cache.json').ok).toBe(false)
    expect(validateToolPath('.canv/permissions.yaml').ok).toBe(false)
    expect(validateToolPath('.canv/config/foo.json').ok).toBe(false)
  })

  it('rejects .canv/sites itself (must include an id segment + child)', () => {
    expect(validateToolPath('.canv/sites').ok).toBe(false)
    expect(validateToolPath('.canv/sites/').ok).toBe(false)
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
