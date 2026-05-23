import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { findActiveTrigger, useAtMention } from './useAtMention'

describe('findActiveTrigger', () => {
  it('returns null for empty input', () => {
    expect(findActiveTrigger('', 0)).toBeNull()
  })

  it('returns null when the caret is before the @ (selStart === 0)', () => {
    expect(findActiveTrigger('@foo', 0)).toBeNull()
  })

  it('detects @ at start of input', () => {
    expect(findActiveTrigger('@', 1)).toEqual({ triggerIndex: 0, query: '' })
  })

  it('captures the query typed after a start-of-input @', () => {
    expect(findActiveTrigger('@foo', 4)).toEqual({ triggerIndex: 0, query: 'foo' })
  })

  it('detects @ after whitespace mid-input', () => {
    expect(findActiveTrigger('hello @foo', 10)).toEqual({ triggerIndex: 6, query: 'foo' })
  })

  it('rejects @ that is not at a word boundary (e.g. email)', () => {
    expect(findActiveTrigger('email@foo', 9)).toBeNull()
  })

  it('rejects when whitespace separates the caret from the @', () => {
    expect(findActiveTrigger('@foo bar', 8)).toBeNull()
  })

  it('finds the most recent @ when several are present', () => {
    expect(findActiveTrigger('@a @b', 5)).toEqual({ triggerIndex: 3, query: 'b' })
  })
})

describe('useAtMention', () => {
  it('activates and shows alphabetised files for an empty query', () => {
    const files = ['z.md', 'a.md', 'm.md']
    const { result } = renderHook(() => useAtMention(files))
    act(() => result.current.sync('@', 1))
    expect(result.current.state.active).toBe(true)
    expect(result.current.state.suggestions).toEqual(['a.md', 'm.md', 'z.md'])
  })

  it('ranks basename hits above directory-only hits', () => {
    const files = ['archive/01.md', 'chapters/01.md', 'chapters/intro.md']
    const { result } = renderHook(() => useAtMention(files))
    act(() => result.current.sync('@01', 3))
    expect(result.current.state.suggestions).toContain('chapters/01.md')
    expect(result.current.state.suggestions).toContain('archive/01.md')
    expect(result.current.state.suggestions).not.toContain('chapters/intro.md')
  })

  it('basename match outranks path-only match for the same query', () => {
    const files = ['notes/intro.md', 'intro/other.md']
    const { result } = renderHook(() => useAtMention(files))
    act(() => result.current.sync('@intro', 6))
    expect(result.current.state.suggestions[0]).toBe('notes/intro.md')
  })

  it('wraps highlight when moving past the ends', () => {
    const files = ['a.md', 'b.md', 'c.md']
    const { result } = renderHook(() => useAtMention(files))
    act(() => result.current.sync('@', 1))
    expect(result.current.state.highlight).toBe(0)
    act(() => result.current.moveHighlight(-1))
    expect(result.current.state.highlight).toBe(2)
    act(() => result.current.moveHighlight(1))
    expect(result.current.state.highlight).toBe(0)
  })

  it('pick() splices the @path into the text and returns the new caret', () => {
    const files = ['chapters/01.md']
    const { result } = renderHook(() => useAtMention(files))
    act(() => result.current.sync('hello @cha', 10))
    const next = result.current.pick('hello @cha', 10)
    expect(next).toEqual({ nextText: 'hello @chapters/01.md ', nextCaret: 22 })
  })

  it('pick() returns null when no trigger is active', () => {
    const files = ['a.md']
    const { result } = renderHook(() => useAtMention(files))
    expect(result.current.pick('no at sign here', 15)).toBeNull()
  })

  it('close() clears active state', () => {
    const { result } = renderHook(() => useAtMention(['a.md']))
    act(() => result.current.sync('@', 1))
    expect(result.current.state.active).toBe(true)
    act(() => result.current.close())
    expect(result.current.state.active).toBe(false)
  })

  it('does not open with no files, even when @ is typed', () => {
    const { result } = renderHook(() => useAtMention([]))
    act(() => result.current.sync('@', 1))
    expect(result.current.state.suggestions).toEqual([])
  })

  it('pick() with explicit overrideIndex uses that suggestion ignoring highlight', () => {
    const files = ['a.md', 'b.md', 'c.md']
    const { result } = renderHook(() => useAtMention(files))
    act(() => result.current.sync('@', 1))
    // highlight is 0; override to 2 should pick 'c.md', not 'a.md'
    const next = result.current.pick('@', 1, 2)
    expect(next).toEqual({ nextText: '@c.md ', nextCaret: 6 })
  })
})
