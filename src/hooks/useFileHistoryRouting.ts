import { useCallback, useEffect, useState } from 'react'
import { useService } from '../services/useService'

interface RestoreTarget {
  snapshotId: string
  relPath: string
}

/**
 * Centralises the App-local file-history UI state and the dock-bridge
 * event plumbing that drives it:
 *
 *   - `fileHistoryTarget` / `fileHistoryNonce` — which file's history tab
 *     is rendered, and a nonce bumped on each openFileHistory call so the
 *     tab refreshes when the same file is re-opened.
 *   - `restoreTarget` — drives the RestorePreviewDialog.
 *   - 'canv:dockBridge:appProps' mirror — keeps dock-bridge.contribution
 *     informed of the App-local props it needs (the contribution can't
 *     read React state directly).
 *   - 'canv:fileHistory:*' listeners — translate events dispatched by the
 *     pop-out (via dock-bridge.contribution) into local state updates.
 *
 * Returning a tight bundle lets AppInner stay focused on JSX wiring.
 */
export function useFileHistoryRouting(): {
  fileHistoryTarget: string | null
  fileHistoryNonce: number
  restoreTarget: RestoreTarget | null
  raEnabled: boolean
  openFileHistory: (rel: string) => void
  setRestoreTarget: (t: RestoreTarget | null) => void
} {
  const ideLayout = useService('ideLayout')
  const workspace = useService('workspace')
  const setup = useService('setup')
  const raEnabled = setup.config?.revisionArchaeology.enabled === true

  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget | null>(null)
  const [fileHistoryTarget, setFileHistoryTarget] = useState<string | null>(null)
  const [fileHistoryNonce, setFileHistoryNonce] = useState(0)

  const openFileHistory = useCallback((rel: string) => {
    setFileHistoryTarget(rel)
    setFileHistoryNonce((n) => n + 1)
    ideLayout.showBottomTab('fileHistory')
  }, [ideLayout])

  // Mirror App-local props into dock-bridge.contribution.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('canv:dockBridge:appProps', {
      detail: {
        fileHistoryTarget,
        fileHistoryNonce,
        revisionArchaeologyEnabled: raEnabled,
      },
    }))
  }, [fileHistoryTarget, fileHistoryNonce, raEnabled])

  // Listen for file-history actions originating from the pop-out (routed
  // through dock-bridge.contribution → window.dispatchEvent). These update
  // App-local state the same way the original useDockBridgeMain config did.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ relPath: string }>).detail
      if (!detail) return
      openFileHistory(detail.relPath)
    }
    const onOpenDiff = (e: Event) => {
      const detail = (e as CustomEvent<{ req: { kind: 'fileHistory'; relPath: string; snapshotId: string; commitSha: string; baseLabel: string } }>).detail
      if (!detail) return
      workspace.openDiffTab(detail.req.relPath, detail.req.commitSha, detail.req.baseLabel)
    }
    const onRestore = (e: Event) => {
      const detail = (e as CustomEvent<{ snapshotId: string; relPath: string }>).detail
      if (!detail) return
      setRestoreTarget({ snapshotId: detail.snapshotId, relPath: detail.relPath })
    }
    window.addEventListener('canv:fileHistory:openRequest', onOpen)
    window.addEventListener('canv:fileHistory:openDiff', onOpenDiff)
    window.addEventListener('canv:fileHistory:restore', onRestore)
    return () => {
      window.removeEventListener('canv:fileHistory:openRequest', onOpen)
      window.removeEventListener('canv:fileHistory:openDiff', onOpenDiff)
      window.removeEventListener('canv:fileHistory:restore', onRestore)
    }
  }, [openFileHistory, workspace])

  return {
    fileHistoryTarget,
    fileHistoryNonce,
    restoreTarget,
    raEnabled,
    openFileHistory,
    setRestoreTarget,
  }
}
