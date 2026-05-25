import type { EditorView } from '@codemirror/view'

/** Inline markdown markers supported by `toggleInline`. */
export type InlineMarker = '**' | '*' | '~~' | '`'

/**
 * Toggle an inline markdown marker around the current selection.
 * - Empty selection: insert `marker+marker`, cursor between.
 * - Already wrapped (marks just inside OR just outside the range): remove them.
 * - Otherwise: wrap, keeping the selection on the inner text.
 * Emits a single transaction (one undo step). Returns true (command-style).
 */
export function toggleInline(view: EditorView, marker: InlineMarker | string): boolean {
  const { state } = view
  const { from, to } = state.selection.main
  const len = marker.length
  const doc = state.doc

  if (from === to) {
    view.dispatch({
      changes: { from, insert: marker + marker },
      selection: { anchor: from + len },
      userEvent: 'input',
    })
    return true
  }

  const inner = doc.sliceString(from, to)
  const before = doc.sliceString(Math.max(0, from - len), from)
  const after = doc.sliceString(to, Math.min(doc.length, to + len))

  if (before === marker && after === marker) {
    view.dispatch({
      changes: [
        { from: from - len, to: from },
        { from: to, to: to + len },
      ],
      selection: { anchor: from - len, head: to - len },
      userEvent: 'delete',
    })
    return true
  }

  if (inner.length >= len * 2 && inner.startsWith(marker) && inner.endsWith(marker)) {
    const innerText = inner.slice(len, inner.length - len)
    view.dispatch({
      changes: { from, to, insert: innerText },
      selection: { anchor: from, head: from + innerText.length },
      userEvent: 'delete',
    })
    return true
  }

  view.dispatch({
    changes: [
      { from, insert: marker },
      { from: to, insert: marker },
    ],
    selection: { anchor: from + len, head: to + len },
    userEvent: 'input',
  })
  return true
}

const HEADING_RE = /^(#{1,3}) /

/**
 * Cycle the heading level of every line the selection touches:
 * none -> `# ` -> `## ` -> `### ` -> none. The target level is derived from
 * the first touched line and applied uniformly. One transaction.
 */
export function cycleHeading(view: EditorView): boolean {
  const { state } = view
  const sel = state.selection.main
  const firstLine = state.doc.lineAt(sel.from)
  const lastLine = state.doc.lineAt(sel.to)

  const firstMatch = HEADING_RE.exec(firstLine.text)
  const currentLevel = firstMatch ? firstMatch[1].length : 0
  const target = (currentLevel + 1) % 4
  const prefix = target === 0 ? '' : '#'.repeat(target) + ' '

  const changes: { from: number; to: number; insert: string }[] = []
  for (let n = firstLine.number; n <= lastLine.number; n++) {
    const line = state.doc.line(n)
    const m = HEADING_RE.exec(line.text)
    const stripLen = m ? m[0].length : 0
    changes.push({ from: line.from, to: line.from + stripLen, insert: prefix })
  }

  view.dispatch({ changes, userEvent: 'input' })
  return true
}
