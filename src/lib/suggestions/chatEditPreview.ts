export interface ChatEditPreview {
  callId: string
  hunks: Array<{ from: number; to: number; original: string; rewrite: string }>
}

/**
 * Maps a pending edit preview to inline-diff target(s) in the open doc.
 *
 * Returns null (→ card fallback) when:
 *  - kind is 'edit' but: path ≠ activeRel, no diff, before missing/ambiguous
 *  - kind is 'apply_edits' but: activeRel is null, edits is empty, any edit
 *    targets a different file, any oldText is missing/ambiguous, or located
 *    ranges overlap
 *  - kind is anything else (create/delete/rename/mkdir/mcp)
 *
 * For kind: 'edit' returns exactly ONE hunk.
 * For kind: 'apply_edits' returns ONE hunk per edit, sorted ascending by from.
 */
export function locateChatEdit(
  docText: string,
  activeRel: string | null,
  callId: string,
  preview: {
    kind: string
    path?: string
    diff?: { before: string; after: string }
    edits?: Array<{ path: string; oldText: string; newText: string }>
  },
): ChatEditPreview | null {
  if (preview.kind === 'edit') {
    return locateEditHunk(docText, activeRel, callId, preview)
  }

  if (preview.kind === 'apply_edits') {
    return locateApplyEditsHunks(docText, activeRel, callId, preview.edits ?? [])
  }

  // All other kinds (create/delete/rename/mkdir/mcp) → card fallback
  return null
}

function locateEditHunk(
  docText: string,
  activeRel: string | null,
  callId: string,
  preview: { path?: string; diff?: { before: string; after: string } },
): ChatEditPreview | null {
  if (!activeRel || preview.path !== activeRel) return null
  if (!preview.diff) return null

  const { before, after } = preview.diff

  // Special-case: empty before on empty doc — range [0,0], unambiguous.
  if (before === '') {
    if (docText !== '') return null // empty string appears everywhere → ambiguous
    return { callId, hunks: [{ from: 0, to: 0, original: before, rewrite: after }] }
  }

  const first = docText.indexOf(before)
  if (first === -1) return null

  const last = docText.lastIndexOf(before)
  if (last !== first) return null // appears more than once → ambiguous

  return {
    callId,
    hunks: [{ from: first, to: first + before.length, original: before, rewrite: after }],
  }
}

function locateApplyEditsHunks(
  docText: string,
  activeRel: string | null,
  callId: string,
  edits: Array<{ path: string; oldText: string; newText: string }>,
): ChatEditPreview | null {
  if (!activeRel) return null
  if (edits.length === 0) return null

  // Every edit must target the active file
  for (const edit of edits) {
    if (edit.path !== activeRel) return null
  }

  // Locate each oldText — must be unique in docText
  const located: Array<{ from: number; to: number; original: string; rewrite: string }> = []
  for (const edit of edits) {
    const { oldText, newText } = edit
    const first = docText.indexOf(oldText)
    if (first === -1) return null // missing → card fallback
    const last = docText.lastIndexOf(oldText)
    if (last !== first) return null // ambiguous → card fallback
    located.push({ from: first, to: first + oldText.length, original: oldText, rewrite: newText })
  }

  // Sort ascending by from
  located.sort((a, b) => a.from - b.from)

  // Check for overlapping ranges
  for (let i = 1; i < located.length; i++) {
    if (located[i].from < located[i - 1].to) return null // overlap → card fallback
  }

  return { callId, hunks: located }
}
