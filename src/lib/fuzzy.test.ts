import { describe, it, expect } from 'vitest'
import { fuzzyScore, fuzzySort } from './fuzzy'

describe('fuzzyScore', () => {
  it('returns 0 when query characters do not appear in order', () => {
    expect(fuzzyScore('z', 'abc').score).toBe(0)
    expect(fuzzyScore('cb', 'abc').score).toBe(0)
  })

  it('returns a positive score for a subsequence match', () => {
    expect(fuzzyScore('ac', 'abc').score).toBeGreaterThan(0)
  })

  it('scores word-start matches higher than mid-word matches', () => {
    const a = fuzzyScore('of', 'open file').score
    const b = fuzzyScore('of', 'overflow').score
    expect(a).toBeGreaterThan(b)
  })

  it('scores consecutive runs higher than scattered matches', () => {
    const a = fuzzyScore('open', 'open palette').score
    const b = fuzzyScore('open', 'output panel renders').score
    expect(a).toBeGreaterThan(b)
  })

  it('is case-insensitive', () => {
    expect(fuzzyScore('OPEN', 'open file').score).toBeGreaterThan(0)
    expect(fuzzyScore('open', 'OPEN FILE').score).toBeGreaterThan(0)
  })

  it('returns the matched indices for highlighting', () => {
    const r = fuzzyScore('of', 'open file')
    expect(r.indices).toEqual([0, 5])
  })

  it('treats an empty query as a neutral pass with score 0 and no indices', () => {
    const r = fuzzyScore('', 'anything')
    expect(r.score).toBe(0)
    expect(r.indices).toEqual([])
  })
})

describe('fuzzySort', () => {
  it('returns items ranked best-first, dropping non-matches', () => {
    const items = ['Open File', 'Open Folder', 'Close Tab', 'Toggle Sidebar']
    const result = fuzzySort('open', items, (s) => s)
    expect(result.map((r) => r.item)).toEqual(['Open File', 'Open Folder'])
  })

  it('returns items unchanged (copy) when query is empty', () => {
    const items = ['a', 'b']
    const result = fuzzySort('', items, (s) => s)
    expect(result.map((r) => r.item)).toEqual(['a', 'b'])
  })
})
