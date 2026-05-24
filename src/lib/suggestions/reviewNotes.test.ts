import { describe, it, expect } from 'vitest'
import { parseReviewNotes, anchorReviewNotes } from './reviewNotes'

describe('parseReviewNotes', () => {
  it('parses a bare JSON array', () => {
    const result = parseReviewNotes('[{"quote":"a","comment":"b"}]')
    expect(result).toEqual([{ quote: 'a', comment: 'b' }])
  })

  it('parses a fenced JSON array', () => {
    const result = parseReviewNotes('```json\n[{"quote":"x","comment":"y"}]\n```')
    expect(result).toEqual([{ quote: 'x', comment: 'y' }])
  })

  it('extracts array from surrounding prose', () => {
    const result = parseReviewNotes(
      'Here are my notes:\n[{"quote":"p","comment":"q"}]\nHope that helps.'
    )
    expect(result).toEqual([{ quote: 'p', comment: 'q' }])
  })

  it('returns null for plain prose with no array', () => {
    const result = parseReviewNotes('I think this paragraph is good.')
    expect(result).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    const result = parseReviewNotes('[{"quote": "a", ')
    expect(result).toBeNull()
  })

  it('returns null for array with wrong shape items', () => {
    const result = parseReviewNotes('[{"foo":1}]')
    expect(result).toBeNull()
  })

  it('drops invalid items and returns only valid ones', () => {
    const result = parseReviewNotes('[{"quote":"a","comment":"b"},{"comment":"no quote"}]')
    expect(result).toEqual([{ quote: 'a', comment: 'b' }])
  })
})

describe('anchorReviewNotes', () => {
  it('anchors two locatable quotes to the right absolute offsets', () => {
    const selectionText = 'Hello world. Goodbye world.'
    const spanFrom = 100
    const notes = [
      { quote: 'Hello', comment: 'Greeting' },
      { quote: 'Goodbye', comment: 'Farewell' },
    ]
    const result = anchorReviewNotes(selectionText, spanFrom, notes)
    expect(result).toMatchObject([
      { from: 100, to: 105, note: 'Greeting' },
      { from: 113, to: 120, note: 'Farewell' },
    ])
  })

  it('returns empty array for empty notes', () => {
    const result = anchorReviewNotes('any text', 0, [])
    expect(result).toEqual([])
  })

  it('anchors a repeated quote to the first occurrence', () => {
    const selectionText = 'cat and cat'
    const spanFrom = 10
    const notes = [{ quote: 'cat', comment: 'first one' }]
    const result = anchorReviewNotes(selectionText, spanFrom, notes)
    expect(result).toMatchObject([{ from: 10, to: 13, note: 'first one' }])
  })

  it('every result carries the original quote string', () => {
    const selectionText = 'Hello world.'
    const result = anchorReviewNotes(selectionText, 0, [
      { quote: 'Hello', comment: 'good' },
      { quote: 'not there', comment: 'bad' },
    ])
    expect(result[0].quote).toBe('Hello')
    expect(result[1].quote).toBe('not there')
  })
})

describe('anchorReviewNotes tolerance', () => {
  const selectionText = "It’s a “beautiful” day.\nThe sun shines brightly here."
  // positions:           0123456789...
  // "It's a "beautiful" day.\nThe sun shines brightly here."
  //  It = 0..2, 's = 2..4, " = 4..5 (smart open), beautiful = 5..14, " = 14..15 (smart close)
  //  " day.\n" = 15..21, "The sun" = 21..28
  const spanFrom = 200

  it('exact substring anchors to correct original offsets', () => {
    const result = anchorReviewNotes(selectionText, spanFrom, [
      { quote: 'sun shines', comment: 'vivid' },
    ])
    const idx = selectionText.indexOf('sun shines')
    expect(result[0].from).toBe(spanFrom + idx)
    expect(result[0].to).toBe(spanFrom + idx + 'sun shines'.length)
  })

  it('smart-quote vs straight-quote mismatch still anchors to correct ORIGINAL offsets', () => {
    // selectionText contains "beautiful" (smart quotes), quote uses straight quotes
    const result = anchorReviewNotes(selectionText, spanFrom, [
      { quote: '"beautiful"', comment: 'word choice' },
    ])
    // should find the smart-quoted span in the original text
    const smartIdx = selectionText.indexOf('“beautiful”')
    expect(result[0].from).toBe(spanFrom + smartIdx)
    expect(result[0].to).toBe(spanFrom + smartIdx + '“beautiful”'.length)
  })

  it('whitespace difference (newline vs space) still anchors', () => {
    // selectionText has "day.\nThe" — model quote uses "day. The"
    const result = anchorReviewNotes(selectionText, spanFrom, [
      { quote: 'day. The sun', comment: 'transition' },
    ])
    // should anchor somewhere covering "day.\nThe sun" in original
    const originalIdx = selectionText.indexOf('day.\nThe sun')
    expect(result[0].from).toBe(spanFrom + originalIdx)
    // to should be > from (not zero-width)
    expect(result[0].to).toBeGreaterThan(result[0].from)
  })

  it('case difference anchors to the correct original-cased offsets', () => {
    // Selects "beautiful" with uppercase in quote
    const result = anchorReviewNotes(selectionText, spanFrom, [
      { quote: 'BEAUTIFUL', comment: 'emphasis' },
    ])
    const originalIdx = selectionText.toLowerCase().indexOf('beautiful')
    // from/to should cover the original lowercase span
    expect(result[0].from).toBe(spanFrom + originalIdx)
    expect(result[0].to).toBe(spanFrom + originalIdx + 'beautiful'.length)
  })

  it('partial / leading-chunk match anchors near the right place when tail is paraphrased', () => {
    // Quote starts correctly but has an invented tail not in source
    const result = anchorReviewNotes(selectionText, spanFrom, [
      { quote: 'sun shines on everything today', comment: 'mixed' },
    ])
    // Should anchor at the start of "sun shines" at minimum
    const sunIdx = selectionText.indexOf('sun shines')
    expect(result[0].from).toBe(spanFrom + sunIdx)
    // to > from (span starts at right place)
    expect(result[0].to).toBeGreaterThan(result[0].from)
  })

  it('totally absent quote returns zero-width anchor (not whole-selection span)', () => {
    const result = anchorReviewNotes(selectionText, spanFrom, [
      { quote: 'zzz this is nowhere in the text zzz', comment: 'missing' },
    ])
    expect(result[0].from).toBe(result[0].to)
    // Critically: must NOT span the whole selection
    expect(result[0].to).not.toBe(spanFrom + selectionText.length)
    expect(result[0].quote).toBe('zzz this is nowhere in the text zzz')
    expect(result[0].note).toBe('missing')
  })

  it('unanchored result preserves quote and note fields', () => {
    const result = anchorReviewNotes('Hello world', 0, [
      { quote: 'xyz does not exist', comment: 'nope' },
    ])
    expect(result[0].quote).toBe('xyz does not exist')
    expect(result[0].note).toBe('nope')
    expect(result[0].from).toBe(result[0].to)
  })
})
