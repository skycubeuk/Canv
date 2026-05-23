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

// Debounce window for word-count recomputes. Selection-only changes still
// notify immediately (cheap); doc changes both delay the notify AND gate the
// actual recompute inside getSnapshot — so continuous typing on a large doc
// produces no React re-renders and no doc.toString() until typing settles.
const DOC_SETTLE_MS = 200

export function useEditorStats(view: EditorView | null): EditorStats {
  // Cache doc word count keyed by the immutable Text instance. CodeMirror
  // mutates state.doc only when the document changes, so a cursor-only move
  // sees the same Text reference and we reuse the cached count. Before this
  // cache, every cursor move recomputed countWords(doc.toString()) — a
  // multi-MB allocation on large docs.
  const lastDoc = useRef<Text | null>(null)
  const lastDocWordCount = useRef(0)
  const lastWordCountAt = useRef(0)
  const lastStats = useRef<EditorStats>(EMPTY)

  const subscribe = useCallback(
    (notify: () => void) => {
      if (!view) return () => {}
      let raf = 0
      let lastDocLen = view.state.doc.length
      let lastSelKey = `${view.state.selection.main.from}-${view.state.selection.main.to}`
      let docSettleTimer: ReturnType<typeof setTimeout> | null = null

      const tick = () => {
        const docLen = view.state.doc.length
        const selKey = `${view.state.selection.main.from}-${view.state.selection.main.to}`
        const docChanged = docLen !== lastDocLen
        const selChanged = selKey !== lastSelKey
        if (docChanged) {
          lastDocLen = docLen
          if (docSettleTimer) clearTimeout(docSettleTimer)
          docSettleTimer = setTimeout(() => {
            docSettleTimer = null
            notify()
          }, DOC_SETTLE_MS)
        }
        if (selChanged) {
          lastSelKey = selKey
          notify()
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => {
        cancelAnimationFrame(raf)
        if (docSettleTimer) clearTimeout(docSettleTimer)
      }
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
      // Doc has changed. Recompute the word count only if we're past the
      // settle window — otherwise show the previous count. Continuous typing
      // hits this branch every keystroke (immutable Text → new ref); without
      // this gate we'd do a 2MB toString + regex split per keystroke.
      // The subscribe() debounce ensures we'll be re-called once typing
      // settles, at which point the gate opens and we recompute.
      const now = performance.now()
      if (now - lastWordCountAt.current >= DOC_SETTLE_MS) {
        wordCount = countWords(doc.toString())
        lastDoc.current = doc
        lastDocWordCount.current = wordCount
        lastWordCountAt.current = now
      }
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
