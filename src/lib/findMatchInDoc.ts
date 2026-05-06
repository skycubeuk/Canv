import { EditorView } from '@codemirror/view'

export interface FindMatchOptions {
  regex: boolean
  caseSensitive: boolean
}

/**
 * Find the first occurrence of `query` in `text` and return start/end
 * character offsets within `text`, or null if no match.
 *
 * Used for testing in isolation and as the inner loop of `findMatchInDoc`.
 */
export function findMatchInPlainText(
  text: string,
  query: string,
  opts: FindMatchOptions,
): { from: number; to: number } | null {
  if (!query) return null
  let pattern: RegExp
  try {
    if (opts.regex) {
      pattern = new RegExp(query, opts.caseSensitive ? '' : 'i')
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      pattern = new RegExp(escaped, opts.caseSensitive ? '' : 'i')
    }
  } catch {
    return null
  }
  const m = pattern.exec(text)
  if (!m || m[0].length === 0) return null
  return { from: m.index, to: m.index + m[0].length }
}

/**
 * Find the (ordinal)th match in the editor's doc and return character
 * offsets suitable for a CodeMirror `EditorSelection.range(from, to)`.
 */
export function findMatchInDoc(
  view: EditorView,
  query: string,
  opts: FindMatchOptions,
  ordinal: number = 0,
): { from: number; to: number } | null {
  if (!query) return null
  const text = view.state.doc.toString()
  let cursor = 0
  let hit: { from: number; to: number } | null = null
  for (let i = 0; i <= ordinal; i++) {
    const m = findMatchInPlainText(text.slice(cursor), query, opts)
    if (!m) return null
    hit = { from: cursor + m.from, to: cursor + m.to }
    cursor += m.to
  }
  return hit
}
