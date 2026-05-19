import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { Text } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

export interface EditorStats {
  wordCount: number
  selectionWordCount: number | null
}

const EMPTY: EditorStats = { wordCount: 0, selectionWordCount: null }

function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

export function useEditorStats(view: EditorView | null): EditorStats {
  // Cache doc word count keyed by the immutable Text instance. CodeMirror
  // mutates state.doc only when the document changes, so a cursor-only move
  // sees the same Text reference and we reuse the cached count. Before this
  // cache, every cursor move recomputed countWords(doc.toString()) — a
  // multi-MB allocation on large docs.
  const lastDoc = useRef<Text | null>(null)
  const lastDocWordCount = useRef(0)
  const lastStats = useRef<EditorStats>(EMPTY)

  const subscribe = useCallback(
    (notify: () => void) => {
      if (!view) return () => {}
      let raf = 0
      let lastDocLen = view.state.doc.length
      let lastSelKey = `${view.state.selection.main.from}-${view.state.selection.main.to}`
      const tick = () => {
        const docLen = view.state.doc.length
        const selKey = `${view.state.selection.main.from}-${view.state.selection.main.to}`
        if (docLen !== lastDocLen || selKey !== lastSelKey) {
          lastDocLen = docLen
          lastSelKey = selKey
          notify()
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(raf)
    },
    [view],
  )

  const getSnapshot = useCallback(() => {
    if (!view) {
      lastDoc.current = null
      lastDocWordCount.current = 0
      lastStats.current = EMPTY
      return EMPTY
    }
    const doc = view.state.doc
    let wordCount = lastDocWordCount.current
    if (doc !== lastDoc.current) {
      wordCount = countWords(doc.toString())
      lastDoc.current = doc
      lastDocWordCount.current = wordCount
    }
    const sel = view.state.selection.main
    let selectionWordCount: number | null = null
    if (!sel.empty) {
      const selWords = countWords(view.state.sliceDoc(sel.from, sel.to))
      if (selWords > 0) selectionWordCount = selWords
    }
    if (
      wordCount === lastStats.current.wordCount &&
      selectionWordCount === lastStats.current.selectionWordCount
    ) {
      return lastStats.current
    }
    lastStats.current = { wordCount, selectionWordCount }
    return lastStats.current
  }, [view])

  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY)
}
