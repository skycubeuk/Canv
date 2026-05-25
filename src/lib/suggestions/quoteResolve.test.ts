import { describe, it, expect } from 'vitest'
import { resolveUniqueQuote } from './quoteResolve'

describe('resolveUniqueQuote', () => {
  it('returns the range of a unique substring', () => {
    expect(resolveUniqueQuote('the cat sat', 'cat')).toEqual({ from: 4, to: 7 })
  })

  it('throws when the quote is absent', () => {
    expect(() => resolveUniqueQuote('the cat sat', 'dog')).toThrow(/not found/)
  })

  it('throws, reporting the count, when the quote is ambiguous', () => {
    expect(() => resolveUniqueQuote('na na na', 'na')).toThrow(/appears 3 times/)
  })

  it('throws when overlapping occurrences make the quote ambiguous', () => {
    expect(() => resolveUniqueQuote('aaab', 'aa')).toThrow(/appears 2 times/)
  })

  it('throws on an empty quote', () => {
    expect(() => resolveUniqueQuote('abc', '')).toThrow(/empty/)
  })
})
