import { useCallback, useEffect, useRef } from 'react'
import type { ActiveEditorUpdateInfo } from '../lib/cm/markdownEditor'

// Returns the onActiveEditorUpdate callback wired to MarkdownEditor, AND
// (as a side-effect of being a hook) also fires `activeDocChanged` whenever
// the active file changes via tab switch. CM6's `update.docChanged` only
// fires when the doc content changes within an editor instance — switching
// between tabs swaps the active editor without firing a docChange, so
// extensions subscribed to `activeDocChanged` would otherwise miss tab
// switches entirely.
export function useExtensionEventBridge(activeMarkdownRel: string | null) {
  const lastRelRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (lastRelRef.current === activeMarkdownRel) return
    lastRelRef.current = activeMarkdownRel
    const dev = window.canvExtensionsDev
    if (!dev) return
    void dev.fireEvent('activeDocChanged', { path: activeMarkdownRel, length: 0, selection: null })
  }, [activeMarkdownRel])

  return useCallback((info: ActiveEditorUpdateInfo) => {
    const payload = { path: info.rel, length: info.length, selection: info.selection }
    const dev = window.canvExtensionsDev
    if (!dev) return
    void dev.fireEvent(info.docChanged ? 'activeDocChanged' : 'selectionChanged', payload)
  }, [])
}
