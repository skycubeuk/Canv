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
    expect(result).toEqual([
      { from: 100, to: 105, note: 'Greeting' },
      { from: 113, to: 120, note: 'Farewell' },
    ])
  })

  it('anchors a missing quote to the whole selection span', () => {
    const selectionText = 'Some text here.'
    const spanFrom = 50
    const notes = [{ quote: 'not present', comment: 'fallback note' }]
    const result = anchorReviewNotes(selectionText, spanFrom, notes)
    expect(result).toEqual([
      { from: 50, to: 65, note: 'fallback note' },
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
    expect(result).toEqual([{ from: 10, to: 13, note: 'first one' }])
  })
})
