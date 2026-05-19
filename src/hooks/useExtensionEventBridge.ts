import { useCallback } from 'react'
import type { ActiveEditorUpdateInfo } from '../lib/cm/markdownEditor'

export function useExtensionEventBridge() {
  return useCallback((info: ActiveEditorUpdateInfo) => {
    const payload = { path: info.rel, length: info.length, selection: info.selection }
    const dev = window.canvExtensionsDev
    if (!dev) return
    void dev.fireEvent(info.docChanged ? 'activeDocChanged' : 'selectionChanged', payload)
  }, [])
}
