import { describe, it, expect } from 'vitest'
import { tabKey, isMarkdownTab, isSettingsTab, isDiffTab, parseDiffKey, parseTabKey, SETTINGS_TAB_KEY } from './tabKey'

describe('tabKey', () => {
  it('returns the rel path for markdown tabs', () => {
    expect(tabKey({ kind: 'markdown', relPath: 'notes/x.md', loadedMarkdown: '', mtimeMs: 0 })).toBe('notes/x.md')
  })

  it('returns the constant settings key for settings tabs', () => {
    expect(tabKey({ kind: 'settings' })).toBe(SETTINGS_TAB_KEY)
    expect(SETTINGS_TAB_KEY).toBe('__settings__')
  })

  it('isMarkdownTab and isSettingsTab discriminate', () => {
    const m = { kind: 'markdown' as const, relPath: 'a.md', loadedMarkdown: '', mtimeMs: 0 }
    const s = { kind: 'settings' as const }
    expect(isMarkdownTab(m)).toBe(true)
    expect(isMarkdownTab(s)).toBe(false)
    expect(isSettingsTab(s)).toBe(true)
    expect(isSettingsTab(m)).toBe(false)
  })

  it('returns diff key for diff tabs', () => {
    expect(tabKey({ kind: 'diff', relPath: 'notes/x.md', baseRef: 'HEAD' })).toBe('diff:notes/x.md@HEAD')
  })
})

describe('isDiffTab', () => {
  const m = { kind: 'markdown' as const, relPath: 'a.md', loadedMarkdown: '', mtimeMs: 0 }
  const s = { kind: 'settings' as const }
  const d = { kind: 'diff' as const, relPath: 'a.md', baseRef: 'HEAD' }

  it('returns true for diff tabs', () => {
    expect(isDiffTab(d)).toBe(true)
  })

  it('returns false for markdown tabs', () => {
    expect(isDiffTab(m)).toBe(false)
  })

  it('returns false for settings tabs', () => {
    expect(isDiffTab(s)).toBe(false)
  })
})

describe('parseDiffKey', () => {
  it('parses a valid diff key', () => {
    expect(parseDiffKey('diff:foo.md@HEAD')).toEqual({ relPath: 'foo.md', baseRef: 'HEAD' })
  })

  it('parses a diff key with path separators', () => {
    expect(parseDiffKey('diff:notes/x.md@HEAD')).toEqual({ relPath: 'notes/x.md', baseRef: 'HEAD' })
  })

  it('returns null for a bare relPath', () => {
    expect(parseDiffKey('foo.md')).toBeNull()
  })

  it('returns null for settings key', () => {
    expect(parseDiffKey('settings')).toBeNull()
  })

  it('returns null for the settings constant key', () => {
    expect(parseDiffKey(SETTINGS_TAB_KEY)).toBeNull()
  })
})

describe('parseTabKey', () => {
  it('parses settings key', () => {
    expect(parseTabKey(SETTINGS_TAB_KEY)).toEqual({ kind: 'settings' })
  })

  it('parses a diff key', () => {
    expect(parseTabKey('diff:notes/x.md@HEAD')).toEqual({ kind: 'diff', relPath: 'notes/x.md', baseRef: 'HEAD' })
  })

  it('returns null for a bare relPath', () => {
    expect(parseTabKey('foo.md')).toBeNull()
  })

  it('returns null for markdown: prefixed key', () => {
    expect(parseTabKey('markdown:foo.md')).toBeNull()
  })
})
