import { useCallback, useRef, useSyncExternalStore } from 'react'
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

function compute(view: EditorView): EditorStats {
  const docText = view.state.doc.toString()
  const wordCount = countWords(docText)
  const sel = view.state.selection.main
  if (sel.empty) return { wordCount, selectionWordCount: null }
  const slice = view.state.sliceDoc(sel.from, sel.to)
  const selWords = countWords(slice)
  return { wordCount, selectionWordCount: selWords > 0 ? selWords : null }
}

export function useEditorStats(view: EditorView | null): EditorStats {
  const lastView = useRef<EditorView | null>(null)
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
      lastView.current = null
      lastStats.current = EMPTY
      return EMPTY
    }
    if (view !== lastView.current) {
      lastView.current = view
      lastStats.current = compute(view)
      return lastStats.current
    }
    const next = compute(view)
    if (
      next.wordCount === lastStats.current.wordCount &&
      next.selectionWordCount === lastStats.current.selectionWordCount
    ) {
      return lastStats.current
    }
    lastStats.current = next
    return next
  }, [view])

  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY)
}
