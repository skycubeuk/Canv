import { describe, it, expect } from 'vitest'
import { decideApply } from './applyDecision'

describe('decideApply', () => {
  it('returns replace-doc when run has no range', () => {
    const d = decideApply('anything', { range: null, sourceText: '' }, 'NEW')
    expect(d).toEqual({ kind: 'replace-doc' })
  })

  it('returns apply with clamped range on a fresh run', () => {
    const doc = 'Paragraph A\n\nParagraph B'
    const run = { range: { from: 0, to: 11 }, sourceText: 'Paragraph A' }
    expect(decideApply(doc, run, 'Rewritten A')).toEqual({ kind: 'apply', from: 0, to: 11 })
  })

  it('clamps an out-of-bounds range to the doc length', () => {
    const doc = 'short'
    const run = { range: { from: 0, to: 999 }, sourceText: 'short' }
    expect(decideApply(doc, run, 'short')).toEqual({ kind: 'already-applied' })
  })

  it('marks already-applied when run.applied is true', () => {
    const doc = 'Paragraph A\n\nParagraph B'
    const run = { range: { from: 0, to: 11 }, sourceText: 'Paragraph A', applied: true }
    expect(decideApply(doc, run, 'Rewritten A')).toEqual({ kind: 'already-applied' })
  })

  it('detects already-applied via slice equality even without the applied flag', () => {
    // After a first apply with replacement "Rewritten paragraph A" (longer
    // than the original "Paragraph A"), the doc grew. The replacement is now
    // sitting verbatim at the run's anchor; a second click must no-op.
    const original = 'Paragraph A\n\nParagraph B'
    const replacement = 'Rewritten paragraph A'
    const docAfterApply = replacement + '\n\nParagraph B'
    const run = { range: { from: 0, to: original.indexOf('\n') }, sourceText: 'Paragraph A' }
    expect(decideApply(docAfterApply, run, replacement)).toEqual({ kind: 'already-applied' })
  })

  it('detects already-applied for the duplicate-prepend regression case', () => {
    // Concrete reproduction of the prologue bug: replacement = source × 2.
    // After Apply 1, doc[from..from+len(replacement)] === replacement, so
    // the second click is caught and refused — no third copy can be added.
    const source = 'Alex sat in her makeshift lab.'
    const replacement = source + source
    const docAfterApply = replacement + '\n\nNext paragraph.'
    const run = { range: { from: 0, to: source.length }, sourceText: source }
    expect(decideApply(docAfterApply, run, replacement)).toEqual({ kind: 'already-applied' })
  })

  it('returns stale when the doc no longer matches sourceText at the range', () => {
    const doc = 'Totally different text now\n\nParagraph B'
    const run = { range: { from: 0, to: 11 }, sourceText: 'Paragraph A' }
    expect(decideApply(doc, run, 'Rewritten A')).toEqual({ kind: 'stale' })
  })

  it('treats whitespace-only differences in the source range as fresh', () => {
    // The original guard trimmed both sides; we preserve that leniency for
    // the fresh-apply path so trailing-newline drift doesn't block apply.
    const doc = '  Paragraph A  \n\nParagraph B'
    const run = { range: { from: 0, to: 15 }, sourceText: 'Paragraph A' }
    expect(decideApply(doc, run, 'Rewritten A')).toEqual({ kind: 'apply', from: 0, to: 15 })
  })

  it('skips the slice-equality short-circuit when replacement is empty', () => {
    // An empty replacement would always "match" any 0-length slice. The
    // implementation guards against that so deletions still go through.
    const doc = 'Paragraph A\n\nParagraph B'
    const run = { range: { from: 0, to: 11 }, sourceText: 'Paragraph A' }
    expect(decideApply(doc, run, '')).toEqual({ kind: 'apply', from: 0, to: 11 })
  })
})
