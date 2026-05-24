import { describe, it, expect } from 'vitest'
import { locateChatEdit } from './chatEditPreview'

const DOC = 'Hello world\nThis is a test\nGoodbye world'

describe('locateChatEdit', () => {
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

  it('returns ChatEditPreview when before found exactly once', () => {
    const result = locateChatEdit(DOC, 'notes.md', 'call-1', {
      kind: 'edit',
      path: 'notes.md',
      diff: { before: 'This is a test', after: 'This is a passing test' },
    })
    expect(result).not.toBeNull()
    expect(result!.callId).toBe('call-1')
    expect(result!.original).toBe('This is a test')
    expect(result!.rewrite).toBe('This is a passing test')
    // "This is a test" starts at index 12 (after "Hello world\n")
    expect(result!.range.from).toBe(12)
    expect(result!.range.to).toBe(12 + 'This is a test'.length)
  })

  it('returns correct range when before is at the start of doc', () => {
    const result = locateChatEdit(DOC, 'notes.md', 'call-1', {
      kind: 'edit',
      path: 'notes.md',
      diff: { before: 'Hello world', after: 'Hi world' },
    })
    expect(result).not.toBeNull()
    expect(result!.range.from).toBe(0)
    expect(result!.range.to).toBe('Hello world'.length)
  })

  it('returns correct range when before is at the end of doc', () => {
    const result = locateChatEdit(DOC, 'notes.md', 'call-1', {
      kind: 'edit',
      path: 'notes.md',
      diff: { before: 'Goodbye world', after: 'Farewell world' },
    })
    expect(result).not.toBeNull()
    const expectedFrom = DOC.indexOf('Goodbye world')
    expect(result!.range.from).toBe(expectedFrom)
    expect(result!.range.to).toBe(expectedFrom + 'Goodbye world'.length)
  })

  it('handles empty before as whole-doc replace — range covers matched empty span at 0', () => {
    // An empty `before` string appears everywhere — indexOf finds it at 0 and
    // lastIndexOf also finds it at 0 (since DOC.indexOf('') === 0 and
    // DOC.lastIndexOf('') === DOC.length). Both will differ → ambiguous → null.
    // Unless the impl is defined to treat empty-before as [0,0] explicitly.
    // Per the spec: "before empty/whole-doc replace → range covers matched span"
    // This means the implementation should treat empty-before as from=0,to=0.
    const singleResult = locateChatEdit('', 'notes.md', 'call-1', {
      kind: 'edit',
      path: 'notes.md',
      diff: { before: '', after: 'new content' },
    })
    // empty doc: empty string found exactly once at position 0
    expect(singleResult).not.toBeNull()
    expect(singleResult!.range.from).toBe(0)
    expect(singleResult!.range.to).toBe(0)
    expect(singleResult!.rewrite).toBe('new content')
  })

  it('passes callId through correctly', () => {
    const result = locateChatEdit(DOC, 'notes.md', 'call-xyz-123', {
      kind: 'edit',
      path: 'notes.md',
      diff: { before: 'Hello world', after: 'Hi world' },
    })
    expect(result!.callId).toBe('call-xyz-123')
  })
})
