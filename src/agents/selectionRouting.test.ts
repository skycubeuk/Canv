import { describe, it, expect } from 'vitest'
import { routeSelectionAgentResult } from './selectionRouting'

describe('routeSelectionAgentResult', () => {
  it('replacement with a changed rewrite → diff only, suppress panel', () => {
    expect(routeSelectionAgentResult({ outputMode: 'replacement', hasRange: true, original: 'a', rewrite: 'b' }))
      .toEqual({ emitDiff: true, emitAnnotation: false, suppressPanel: true })
  })
  it('replacement with no selection range → nothing inline, keep panel', () => {
    expect(routeSelectionAgentResult({ outputMode: 'replacement', hasRange: false, original: 'a', rewrite: 'b' }))
      .toEqual({ emitDiff: false, emitAnnotation: false, suppressPanel: false })
  })
  it('replacement where rewrite equals original → nothing inline', () => {
    expect(routeSelectionAgentResult({ outputMode: 'replacement', hasRange: true, original: 'a', rewrite: 'a' }))
      .toEqual({ emitDiff: false, emitAnnotation: false, suppressPanel: false })
  })
  it('feedback-only with notes → annotation only, suppress panel', () => {
    expect(routeSelectionAgentResult({ outputMode: 'feedback-only', hasRange: true, original: 'a', feedback: 'note' }))
      .toEqual({ emitDiff: false, emitAnnotation: true, suppressPanel: true })
  })
  it('feedback-only with empty notes → nothing inline', () => {
    expect(routeSelectionAgentResult({ outputMode: 'feedback-only', hasRange: true, original: 'a', feedback: '   ' }))
      .toEqual({ emitDiff: false, emitAnnotation: false, suppressPanel: false })
  })
  it('feedback-and-rewrite with both → diff + annotation, suppress panel', () => {
    expect(routeSelectionAgentResult({ outputMode: 'feedback-and-rewrite', hasRange: true, original: 'a', rewrite: 'b', feedback: 'note' }))
      .toEqual({ emitDiff: true, emitAnnotation: true, suppressPanel: true })
  })
  it('feedback-and-rewrite with rewrite only → diff only', () => {
    expect(routeSelectionAgentResult({ outputMode: 'feedback-and-rewrite', hasRange: true, original: 'a', rewrite: 'b' }))
      .toEqual({ emitDiff: true, emitAnnotation: false, suppressPanel: true })
  })
  it('unknown mode → nothing inline', () => {
    expect(routeSelectionAgentResult({ outputMode: 'whatever', hasRange: true, original: 'a', rewrite: 'b', feedback: 'n' }))
      .toEqual({ emitDiff: false, emitAnnotation: false, suppressPanel: false })
  })
})
