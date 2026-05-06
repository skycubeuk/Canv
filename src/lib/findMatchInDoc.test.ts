import { describe, it, expect } from 'vitest'
import { findMatchInDoc, findMatchInPlainText } from './findMatchInDoc'
import type { EditorView } from '@codemirror/view'

describe('findMatchInPlainText', () => {
  it('finds the first occurrence as char offsets', () => {
    expect(findMatchInPlainText('hello world', 'world', { regex: false, caseSensitive: true }))
      .toEqual({ from: 6, to: 11 })
  })

  it('respects caseSensitive=false', () => {
    expect(findMatchInPlainText('Hello World', 'world', { regex: false, caseSensitive: false }))
      .toEqual({ from: 6, to: 11 })
  })

  it('returns null for no match', () => {
    expect(findMatchInPlainText('abc', 'zzz', { regex: false, caseSensitive: true })).toBeNull()
  })

  it('escapes regex metachars in literal mode', () => {
    expect(findMatchInPlainText('a.b', 'a.b', { regex: false, caseSensitive: true }))
      .toEqual({ from: 0, to: 3 })
  })

  it('honours regex mode', () => {
    expect(findMatchInPlainText('foo123bar', '\\d+', { regex: true, caseSensitive: true }))
      .toEqual({ from: 3, to: 6 })
  })
})

describe('findMatchInDoc', () => {
  // Minimal mock — findMatchInDoc only reads view.state.doc.toString().
  function mockView(text: string): EditorView {
    return {
      state: {
        doc: { toString: () => text },
      },
    } as unknown as EditorView
  }

  it('finds the first match', () => {
    const view = mockView('hello world')
    const range = findMatchInDoc(view, 'world', { regex: false, caseSensitive: true })
    expect(range).toEqual({ from: 6, to: 11 })
  })

  it('returns the Nth match when ordinal > 0', () => {
    const view = mockView('foo bar foo foo end')
    const first = findMatchInDoc(view, 'foo', { regex: false, caseSensitive: true }, 0)
    const second = findMatchInDoc(view, 'foo', { regex: false, caseSensitive: true }, 1)
    const third = findMatchInDoc(view, 'foo', { regex: false, caseSensitive: true }, 2)
    expect(first?.from).toBe(0)
    expect(second?.from).toBe(8)
    expect(third?.from).toBe(12)
  })

  it('returns null when ordinal exceeds match count', () => {
    const view = mockView('only one foo here')
    expect(findMatchInDoc(view, 'foo', { regex: false, caseSensitive: true }, 5)).toBeNull()
  })

  it('returns null for empty query', () => {
    const view = mockView('abc')
    expect(findMatchInDoc(view, '', { regex: false, caseSensitive: true })).toBeNull()
  })
})
