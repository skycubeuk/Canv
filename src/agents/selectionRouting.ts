export interface SelectionRouting {
  emitDiff: boolean
  emitAnnotation: boolean
  /** Suppress the Runs panel because something rendered inline. */
  suppressPanel: boolean
}

export interface SelectionRoutingInput {
  outputMode: string
  hasRange: boolean
  original: string
  rewrite?: string
  feedback?: string
}

/** Decide what a finished selection-agent run renders in the document. */
export function routeSelectionAgentResult(input: SelectionRoutingInput): SelectionRouting {
  const canDiff =
    input.hasRange && !!input.rewrite && input.rewrite.trim().length > 0 && input.rewrite !== input.original
  const canAnnotate = input.hasRange && !!input.feedback && input.feedback.trim().length > 0
  let emitDiff = false
  let emitAnnotation = false
  if (input.outputMode === 'replacement') emitDiff = canDiff
  else if (input.outputMode === 'feedback-only') emitAnnotation = canAnnotate
  else if (input.outputMode === 'feedback-and-rewrite') {
    emitDiff = canDiff
    emitAnnotation = canAnnotate
  }
  return { emitDiff, emitAnnotation, suppressPanel: emitDiff || emitAnnotation }
}
