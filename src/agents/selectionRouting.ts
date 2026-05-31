import type { AiChangesDisplay } from '../hooks/settingsSchema'

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
export function routeSelectionAgentResult(
  input: SelectionRoutingInput,
  displayMode: AiChangesDisplay = 'both',
): SelectionRouting {
  const canDiff =
    input.hasRange && !!input.rewrite && input.rewrite.trim().length > 0 && input.rewrite !== input.original
  // Annotations anchor by quote-matching anywhere in the supplied text, so unlike a
  // rewrite diff (which replaces a specific range) they do not need a selection range —
  // a whole-document run anchors from offset 0.
  const canAnnotate = !!input.feedback && input.feedback.trim().length > 0
  let emitDiff = false
  let emitAnnotation = false
  if (input.outputMode === 'replacement') emitDiff = canDiff
  else if (input.outputMode === 'feedback-only') emitAnnotation = canAnnotate
  else if (input.outputMode === 'feedback-and-rewrite') {
    emitDiff = canDiff
    emitAnnotation = canAnnotate
  }
  // 'panel' mode: render nothing inline; the Runs panel keeps its diff preview
  // and (because inlineEmitted follows emitDiff) its legacy Apply button.
  if (displayMode === 'panel') {
    emitDiff = false
    emitAnnotation = false
  }
  return { emitDiff, emitAnnotation, suppressPanel: emitDiff || emitAnnotation }
}
