import { describe, it, expect } from 'vitest'
import { makeAnchor, resolveAnchor } from './anchor'

describe('makeAnchor', () => {
  it('captures the exact quoted text', () => {
    const anchor = makeAnchor('the cat sat on the mat', 4, 7)
    expect(anchor.quote).toBe('cat')
  })

  it('captures bounded prefix/suffix around the quote (ctx=32)', () => {
    const doc = 'a'.repeat(100) + 'TARGET' + 'b'.repeat(100)
    const anchor = makeAnchor(doc, 100, 106, 32)
    expect(anchor.quote).toBe('TARGET')
    expect(anchor.prefix).toBe('a'.repeat(32))
    expect(anchor.suffix).toBe('b'.repeat(32))
  })

  it('clamps prefix at doc start and suffix at doc end', () => {
    const anchor = makeAnchor('cat sat', 0, 3, 32)
    expect(anchor.prefix).toBe('')
    expect(anchor.quote).toBe('cat')
    const anchor2 = makeAnchor('the cat', 4, 7, 32)
    expect(anchor2.suffix).toBe('')
  })

  it('defaults ctx to 32', () => {
    const doc = 'x'.repeat(50) + 'Q' + 'y'.repeat(50)
    const anchor = makeAnchor(doc, 50, 51)
    expect(anchor.prefix).toHaveLength(32)
    expect(anchor.suffix).toHaveLength(32)
  })
})

describe('resolveAnchor', () => {
  it('round-trips: makeAnchor then resolveAnchor returns the original from/to', () => {
    const doc = 'the cat sat on the mat'
    const anchor = makeAnchor(doc, 4, 7)
    expect(resolveAnchor(doc, anchor)).toEqual({ from: 4, to: 7 })
  })

  it('finds the span after text was inserted BEFORE it (offsets shifted)', () => {
    const original = 'the cat sat on the mat'
    const anchor = makeAnchor(original, 4, 7) // anchors "cat"
    const modified = 'well, ' + original // 6 chars inserted before
    const result = resolveAnchor(modified, anchor)
    expect(result).not.toBeNull()
    expect(modified.slice(result!.from, result!.to)).toBe('cat')
    expect(result!.from).toBe(10)
    expect(result!.to).toBe(13)
  })

  it('returns the occurrence matching prefix/suffix when the quote repeats', () => {
    // "cat" appears at 4 and at 16; the anchor targets the second one.
    const doc = 'the cat sat and cat ran'
    const anchor = makeAnchor(doc, 16, 19, 8) // "cat" at 16
    const result = resolveAnchor(doc, anchor)
    expect(result).not.toBeNull()
    expect(result!.from).toBe(16)
    expect(result!.to).toBe(19)
  })

  it('returns null when the anchored quote no longer exists', () => {
    const original = 'the cat sat'
    const anchor = makeAnchor(original, 4, 7)
    const modified = 'the dog sat'
    expect(resolveAnchor(modified, anchor)).toBeNull()
  })

  it('falls back to a unique quote match when context no longer aligns', () => {
    const doc = 'the xenomorph is here'
    // Anchor with deliberately wrong context but a quote that is unique.
    const mutated = { quote: 'xenomorph', prefix: 'WRONG-PREFIX', suffix: 'WRONG-SUFFIX' }
    const result = resolveAnchor(doc, mutated)
    expect(result).not.toBeNull()
    expect(doc.slice(result!.from, result!.to)).toBe('xenomorph')
  })

  it('returns null for an empty quote', () => {
    expect(resolveAnchor('whatever', { quote: '', prefix: '', suffix: '' })).toBeNull()
  })
})
