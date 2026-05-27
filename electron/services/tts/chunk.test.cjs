'use strict'
const { chunkText } = require('./chunk.cjs')

describe('chunkText', () => {
  it('returns a single chunk when under the limit', () => {
    expect(chunkText('Hello world.', 100)).toEqual(['Hello world.'])
  })

  it('splits on sentence boundaries, never exceeding the limit', () => {
    const text = 'One sentence here. Two sentence here. Three sentence here.'
    const out = chunkText(text, 25)
    expect(out.length).toBeGreaterThan(1)
    for (const c of out) expect(c.length).toBeLessThanOrEqual(25)
    expect(out.join(' ').replace(/\s+/g, ' ').trim()).toBe(text.replace(/\s+/g, ' ').trim())
  })

  it('hard-splits a single oversized sentence at the limit', () => {
    const text = 'x'.repeat(50)
    const out = chunkText(text, 20)
    expect(out).toEqual(['x'.repeat(20), 'x'.repeat(20), 'x'.repeat(10)])
    expect(out.join('')).toBe('x'.repeat(50))
  })

  it('returns [] for empty/whitespace input', () => {
    expect(chunkText('   ', 100)).toEqual([])
  })

  it('returns [] for limit < 1', () => {
    expect(chunkText('hello', 0)).toEqual([])
  })
})
