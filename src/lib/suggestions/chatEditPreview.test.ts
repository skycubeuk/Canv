import { describe, it, expect } from 'vitest'
import { locateChatEdit } from './chatEditPreview'

const DOC = 'Hello world\nThis is a test\nGoodbye world'

describe('locateChatEdit', () => {
  // ---- kind: 'edit' (single-hunk path) -------------------------------------

  it('returns null when kind is not edit', () => {
    const result = locateChatEdit(DOC, 'notes.md', 'call-1', {
      kind: 'create',
      path: 'notes.md',
      diff: { before: 'Hello world', after: 'Hi world' },
    })
    expect(result).toBeNull()
  })

  it('returns null when path does not match activeRel', () => {
    const result = locateChatEdit(DOC, 'other.md', 'call-1', {
      kind: 'edit',
      path: 'notes.md',
      diff: { before: 'Hello world', after: 'Hi world' },
    })
    expect(result).toBeNull()
  })

  it('returns null when activeRel is null', () => {
    const result = locateChatEdit(DOC, null, 'call-1', {
      kind: 'edit',
      path: 'notes.md',
      diff: { before: 'Hello world', after: 'Hi world' },
    })
    expect(result).toBeNull()
  })

  it('returns null when diff is missing', () => {
    const result = locateChatEdit(DOC, 'notes.md', 'call-1', {
      kind: 'edit',
      path: 'notes.md',
    })
    expect(result).toBeNull()
  })

  it('returns null when before is not found in docText', () => {
    const result = locateChatEdit(DOC, 'notes.md', 'call-1', {
      kind: 'edit',
      path: 'notes.md',
      diff: { before: 'not present in doc', after: 'replacement' },
    })
    expect(result).toBeNull()
  })

  it('returns null when before appears more than once (ambiguous)', () => {
    const ambiguousDoc = 'foo bar foo bar'
    const result = locateChatEdit(ambiguousDoc, 'notes.md', 'call-1', {
      kind: 'edit',
      path: 'notes.md',
      diff: { before: 'foo', after: 'baz' },
    })
    expect(result).toBeNull()
  })

  it('returns ChatEditPreview with one hunk when before found exactly once', () => {
    const result = locateChatEdit(DOC, 'notes.md', 'call-1', {
      kind: 'edit',
      path: 'notes.md',
      diff: { before: 'This is a test', after: 'This is a passing test' },
    })
    expect(result).not.toBeNull()
    expect(result!.callId).toBe('call-1')
    expect(result!.hunks).toHaveLength(1)
    const hunk = result!.hunks[0]
    expect(hunk.original).toBe('This is a test')
    expect(hunk.rewrite).toBe('This is a passing test')
    // "This is a test" starts at index 12 (after "Hello world\n")
    expect(hunk.from).toBe(12)
    expect(hunk.to).toBe(12 + 'This is a test'.length)
  })

  it('returns correct range when before is at the start of doc', () => {
    const result = locateChatEdit(DOC, 'notes.md', 'call-1', {
      kind: 'edit',
      path: 'notes.md',
      diff: { before: 'Hello world', after: 'Hi world' },
    })
    expect(result).not.toBeNull()
    expect(result!.hunks).toHaveLength(1)
    expect(result!.hunks[0].from).toBe(0)
    expect(result!.hunks[0].to).toBe('Hello world'.length)
  })

  it('returns correct range when before is at the end of doc', () => {
    const result = locateChatEdit(DOC, 'notes.md', 'call-1', {
      kind: 'edit',
      path: 'notes.md',
      diff: { before: 'Goodbye world', after: 'Farewell world' },
    })
    expect(result).not.toBeNull()
    const expectedFrom = DOC.indexOf('Goodbye world')
    expect(result!.hunks[0].from).toBe(expectedFrom)
    expect(result!.hunks[0].to).toBe(expectedFrom + 'Goodbye world'.length)
  })

  it('handles empty before as whole-doc replace — range covers matched empty span at 0', () => {
    const singleResult = locateChatEdit('', 'notes.md', 'call-1', {
      kind: 'edit',
      path: 'notes.md',
      diff: { before: '', after: 'new content' },
    })
    expect(singleResult).not.toBeNull()
    expect(singleResult!.hunks).toHaveLength(1)
    expect(singleResult!.hunks[0].from).toBe(0)
    expect(singleResult!.hunks[0].to).toBe(0)
    expect(singleResult!.hunks[0].rewrite).toBe('new content')
  })

  it('passes callId through correctly', () => {
    const result = locateChatEdit(DOC, 'notes.md', 'call-xyz-123', {
      kind: 'edit',
      path: 'notes.md',
      diff: { before: 'Hello world', after: 'Hi world' },
    })
    expect(result!.callId).toBe('call-xyz-123')
  })

  // ---- kind: 'apply_edits' (multi-hunk path) --------------------------------

  it('apply_edits: returns N hunks sorted by position when all edits target activeRel and are unique', () => {
    // DOC = 'Hello world\nThis is a test\nGoodbye world'
    const result = locateChatEdit(DOC, 'notes.md', 'call-2', {
      kind: 'apply_edits',
      edits: [
        { path: 'notes.md', oldText: 'Goodbye world', newText: 'Farewell world' },
        { path: 'notes.md', oldText: 'Hello world', newText: 'Hi world' },
      ],
    })
    expect(result).not.toBeNull()
    expect(result!.callId).toBe('call-2')
    expect(result!.hunks).toHaveLength(2)
    // First hunk (by position) should be 'Hello world' which is at 0
    expect(result!.hunks[0].from).toBe(0)
    expect(result!.hunks[0].to).toBe('Hello world'.length)
    expect(result!.hunks[0].original).toBe('Hello world')
    expect(result!.hunks[0].rewrite).toBe('Hi world')
    // Second hunk: 'Goodbye world' starts after the two preceding lines
    const gbFrom = DOC.indexOf('Goodbye world')
    expect(result!.hunks[1].from).toBe(gbFrom)
    expect(result!.hunks[1].to).toBe(gbFrom + 'Goodbye world'.length)
    expect(result!.hunks[1].original).toBe('Goodbye world')
    expect(result!.hunks[1].rewrite).toBe('Farewell world')
    // Hunks must be sorted ascending by from
    expect(result!.hunks[0].from).toBeLessThan(result!.hunks[1].from)
  })

  it('apply_edits: single edit on activeRel → one hunk', () => {
    const result = locateChatEdit(DOC, 'notes.md', 'call-3', {
      kind: 'apply_edits',
      edits: [{ path: 'notes.md', oldText: 'This is a test', newText: 'This is a passing test' }],
    })
    expect(result).not.toBeNull()
    expect(result!.hunks).toHaveLength(1)
    expect(result!.hunks[0].from).toBe(12)
    expect(result!.hunks[0].to).toBe(12 + 'This is a test'.length)
    expect(result!.hunks[0].original).toBe('This is a test')
    expect(result!.hunks[0].rewrite).toBe('This is a passing test')
  })

  it('apply_edits: returns null when any edit targets a different file', () => {
    const result = locateChatEdit(DOC, 'notes.md', 'call-4', {
      kind: 'apply_edits',
      edits: [
        { path: 'notes.md', oldText: 'Hello world', newText: 'Hi world' },
        { path: 'other.md', oldText: 'This is a test', newText: 'This is a passing test' },
      ],
    })
    expect(result).toBeNull()
  })

  it('apply_edits: returns null when an oldText is not found in docText', () => {
    const result = locateChatEdit(DOC, 'notes.md', 'call-5', {
      kind: 'apply_edits',
      edits: [
        { path: 'notes.md', oldText: 'Hello world', newText: 'Hi world' },
        { path: 'notes.md', oldText: 'not in doc at all', newText: 'whatever' },
      ],
    })
    expect(result).toBeNull()
  })

  it('apply_edits: returns null when an oldText appears more than once (ambiguous)', () => {
    const ambiguousDoc = 'foo bar\nfoo baz'
    const result = locateChatEdit(ambiguousDoc, 'notes.md', 'call-6', {
      kind: 'apply_edits',
      edits: [{ path: 'notes.md', oldText: 'foo', newText: 'qux' }],
    })
    expect(result).toBeNull()
  })

  it('apply_edits: returns null when located ranges overlap', () => {
    // 'Hello world' overlaps with 'Hello wor' if both are searched
    const doc = 'Hello world'
    const result = locateChatEdit(doc, 'notes.md', 'call-7', {
      kind: 'apply_edits',
      edits: [
        { path: 'notes.md', oldText: 'Hello world', newText: 'Hi world' },
        { path: 'notes.md', oldText: 'Hello wor', newText: 'Hi wor' },
      ],
    })
    expect(result).toBeNull()
  })

  it('apply_edits: returns null when activeRel is null', () => {
    const result = locateChatEdit(DOC, null, 'call-8', {
      kind: 'apply_edits',
      edits: [{ path: 'notes.md', oldText: 'Hello world', newText: 'Hi world' }],
    })
    expect(result).toBeNull()
  })

  it('apply_edits: returns null when edits array is empty', () => {
    const result = locateChatEdit(DOC, 'notes.md', 'call-9', {
      kind: 'apply_edits',
      edits: [],
    })
    expect(result).toBeNull()
  })
})
