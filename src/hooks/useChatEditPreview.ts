import { useEffect, useRef, useState, useCallback } from 'react'
import type { EditorView } from '@codemirror/view'
import { setEditPreview, clearEditPreview } from '../lib/cm/suggestionLayer'
import { locateChatEdit } from '../lib/suggestions/chatEditPreview'
import type { PendingApproval } from '../components/ChatPanel'
import type { ApprovalDecision } from '../agents/chatRunner'

export interface UseChatEditPreviewDeps {
  pendingApprovals: Map<string, PendingApproval>
  onApprovalDecide: (callId: string, decision: ApprovalDecision) => void
  getActiveEditor: () => EditorView | null
  activeMarkdownRel: string | null
}

/**
 * Watches `pendingApprovals` for a single `edit_file` approval that targets the
 * currently open file, then renders it as an inline diff preview via the
 * `editPreviewField` effect rather than the normal approval card.
 *
 * Returns the callId of the approval currently shown inline so that
 * `useBottomPanelTabs` can suppress the duplicate card.
 *
 * Accept/reject flow: approving/rejecting via the inline controls resolves
 * the existing `onApprovalDecide` promise — the chat tool write path is
 * untouched. The inline preview itself is NEVER applied to the document.
 */
export function useChatEditPreview(deps: UseChatEditPreviewDeps): {
  previewedCallId: string | null
  approveEdit: (callId: string, view: EditorView) => void
  rejectEdit: (callId: string, view: EditorView) => void
} {
  // Keep deps fresh without recreating stable callbacks on every render.
  const depsRef = useRef(deps)
  // eslint-disable-next-line react-hooks/refs -- stable callbacks read depsRef in event handlers only
  depsRef.current = deps

  const [previewedCallId, setPreviewedCallId] = useState<string | null>(null)
  const previewedCallIdRef = useRef<string | null>(null)

  // Sync the ref whenever state changes so stable callbacks can read it.
  previewedCallIdRef.current = previewedCallId

  // Core effect: scan pendingApprovals every time they (or the active file) change.
  useEffect(() => {
    const { pendingApprovals, activeMarkdownRel, getActiveEditor } = deps

    const view = getActiveEditor()

    // Find the first pending edit_file approval that resolves on the active file.
    let found: { callId: string; from: number; to: number; original: string; rewrite: string } | null = null
    for (const [, approval] of pendingApprovals) {
      if (approval.state !== 'pending') continue
      const result = locateChatEdit(
        view ? view.state.doc.toString() : '',
        activeMarkdownRel,
        approval.callId,
        approval.preview,
      )
      if (result) {
        found = result.range
          ? { callId: result.callId, from: result.range.from, to: result.range.to, original: result.original, rewrite: result.rewrite }
          : null
        if (found) break
      }
    }

    const currentId = previewedCallIdRef.current

    if (found) {
      // If it's a different call (or no current), dispatch the preview.
      if (found.callId !== currentId) {
        if (view) {
          view.dispatch({ effects: setEditPreview.of({ callId: found.callId, from: found.from, to: found.to, rewrite: found.rewrite }) })
        }
        setPreviewedCallId(found.callId)
        previewedCallIdRef.current = found.callId
      }
    } else {
      // No matching pending approval — clear any active preview.
      if (currentId !== null) {
        const v = getActiveEditor()
        if (v) v.dispatch({ effects: clearEditPreview.of(null) })
        setPreviewedCallId(null)
        previewedCallIdRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run when pendingApprovals or activeMarkdownRel change
  }, [deps.pendingApprovals, deps.activeMarkdownRel])

  const approveEdit = useCallback((callId: string, view: EditorView) => {
    // Resolve the approval (chat tool does the write).
    depsRef.current.onApprovalDecide(callId, 'approve')
    // Clear the inline preview decoration — the approval card will update.
    view.dispatch({ effects: clearEditPreview.of(null) })
    setPreviewedCallId(null)
    previewedCallIdRef.current = null
  }, [])

  const rejectEdit = useCallback((callId: string, view: EditorView) => {
    depsRef.current.onApprovalDecide(callId, 'deny')
    view.dispatch({ effects: clearEditPreview.of(null) })
    setPreviewedCallId(null)
    previewedCallIdRef.current = null
  }, [])

  return { previewedCallId, approveEdit, rejectEdit }
}
