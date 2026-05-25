import { describe, it, expect } from 'vitest'
import { computeHunks, changesForHunks } from './hunks'

describe('computeHunks', () => {
  it('returns no hunks when text is unchanged', () => {
    expect(computeHunks(0, 'hello world', 'hello world')).toEqual([])
  })

  it('produces a fine-grained replacement hunk for a small edit', () => {
    // "the cat sat" -> "the dog sat": only "cat" -> "dog" changes.
    const hunks = computeHunks(0, 'the cat sat', 'the dog sat')
    expect(hunks).toHaveLength(1)
    const h = hunks[0]
    expect('the cat sat'.slice(h.from, h.to)).toBe('cat')
    expect(h.insert).toBe('dog')
    expect(h.status).toBe('pending')
  })

  it('offsets positions by spanFrom', () => {
    const hunks = computeHunks(100, 'the cat sat', 'the dog sat')
    expect(hunks[0].from).toBe(104)
    expect(hunks[0].to).toBe(107)
  })

  it('produces two separate hunks for two separated edits', () => {
    const hunks = computeHunks(0, 'red fox and blue ox', 'red cat and blue dog')
    expect(hunks).toHaveLength(2)
  })

  it('represents a pure insertion as a point hunk', () => {
    // diffWordsWithSpace tokenises on word/space boundaries, so the insertion
    // must be a whole word; the inserted token may carry an adjoining space.
    const hunks = computeHunks(0, 'hello world', 'hello brave world')
    expect(hunks).toHaveLength(1)
    expect(hunks[0].from).toBe(hunks[0].to) // point insertion
    expect(hunks[0].insert).toContain('brave')
  })

  it('collapses a near-total rewrite into a single block hunk', () => {
    const original = 'the quick brown fox'
    const rewrite = 'a completely different sentence entirely'
    const hunks = computeHunks(0, original, rewrite)
    expect(hunks).toHaveLength(1)
    expect(hunks[0].from).toBe(0)
    expect(hunks[0].to).toBe(original.length)
    expect(hunks[0].insert).toBe(rewrite)
    // also verify the block-hunk path applies the offset
    const offset = computeHunks(50, original, rewrite)
    expect(offset[0].from).toBe(50)
    expect(offset[0].to).toBe(50 + original.length)
  })

  it('represents a pure deletion as a hunk with empty insert', () => {
    const hunks = computeHunks(0, 'hello brave world', 'hello world')
    expect(hunks).toHaveLength(1)
    expect(hunks[0].insert).toBe('')
    expect('hello brave world'.slice(hunks[0].from, hunks[0].to)).toContain('brave')
  })
})

describe('changesForHunks', () => {
  it('maps pending hunks to ChangeSpecs and skips invalidated ones', () => {
    const specs = changesForHunks([
      { id: '0', from: 0, to: 3, insert: 'dog', status: 'pending' },
      { id: '1', from: 8, to: 8, insert: 'X', status: 'invalidated' },
    ])
    expect(specs).toEqual([{ from: 0, to: 3, insert: 'dog' }])
  })
})
