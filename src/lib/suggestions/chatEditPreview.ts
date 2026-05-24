export interface ChatEditPreview {
  callId: string
  range: { from: number; to: number }
  original: string
  rewrite: string
}

/**
 * Maps a pending edit preview to an inline-diff target in the open doc.
 *
 * Returns null (→ card fallback) when:
 *  - The preview kind is not 'edit'
 *  - The path does not match the currently active file
 *  - No diff is present
 *  - `before` does not occur in docText (missing) or occurs more than once (ambiguous)
 *
 * When `before` is empty the only valid scenario is an empty docText (empty
 * string indexOf returns 0 always, but indexOf and lastIndexOf both return 0 for
 * an empty doc → treated as unique → range [0,0]).
 */
export function locateChatEdit(
  docText: string,
  activeRel: string | null,
  callId: string,
  preview: { kind: string; path?: string; diff?: { before: string; after: string } },
): ChatEditPreview | null {
  if (preview.kind !== 'edit') return null
  if (!activeRel || preview.path !== activeRel) return null
  if (!preview.diff) return null

  const { before, after } = preview.diff

  // Special-case: empty before on empty doc — range [0,0], unambiguous.
  if (before === '') {
    if (docText !== '') return null // empty string appears everywhere in a non-empty doc → ambiguous
    return { callId, range: { from: 0, to: 0 }, original: before, rewrite: after }
  }

  const first = docText.indexOf(before)
  if (first === -1) return null

  const last = docText.lastIndexOf(before)
  if (last !== first) return null // appears more than once → ambiguous

  return {
    callId,
    range: { from: first, to: first + before.length },
    original: before,
    rewrite: after,
  }
}
