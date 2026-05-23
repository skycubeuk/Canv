import { useCallback } from 'react'
import { useService } from '../services/useService'
import { getCanvHistory } from '../lib/history'
import type { RunRecord } from '../components/ResultsPanel'

/**
 * Returns the apply-run-with-snapshot closure used by the Runs tab in the
 * bottom panel. When revision-archaeology is enabled and a markdown file is
 * active, the apply is bracketed by `before_ai_edit` / `after_ai_edit`
 * snapshots on canv-history. Otherwise it falls back to the plain apply.
 *
 * This used to live inline in AppInner. Moving it here keeps App.tsx focused
 * on UI state and JSX.
 */
export function useApplyRunWithSnapshot(): (run: RunRecord, replacement: string) => Promise<void> {
  const workspace = useService('workspace')
  const setup = useService('setup')
  const editorRegistry = useService('editorRegistry')
  const notifications = useService('notifications')
  const selectionAgent = useService('selectionAgent')
  const raEnabled = setup.config?.revisionArchaeology.enabled === true

  return useCallback(async (run: RunRecord, replacement: string) => {
    const rel = workspace.activeMarkdownRel
    const client = raEnabled ? getCanvHistory() : null

    if (!client || !rel) {
      selectionAgent.handleApply(run, replacement)
      return
    }

    const meta = {
      source: 'agent_apply',
      runId: run.id,
      agentId: run.agentId,
      agentLabel: run.agentLabel,
      provider: run.provider,
      model: run.model,
    }

    // Persist any pending edits so the before-snapshot reflects current on-disk state.
    try { await workspace.flushAll() } catch (e) { console.warn('[apply] flush before snapshot failed', e) }

    let beforeId: string | null = null
    try {
      const e = await client.createSnapshot({
        reason: 'before_ai_edit',
        summary: `Before apply · ${run.agentLabel}`,
        files: [rel],
        metadata: meta,
      })
      beforeId = e.id
    } catch (e) {
      console.warn('[apply] before snapshot failed', e)
      notifications.showToast(`History snapshot failed: ${(e as Error).message}`)
    }

    // Run the existing apply path — handles decideApply, dispatch, setRuns, toast.
    selectionAgent.handleApply(run, replacement)

    // The dispatch is in-memory. Force-save and wait so the file lands on disk before the after-snapshot.
    const view = editorRegistry.getActiveEditor()
    if (view && rel) {
      workspace.saveTab(rel, view.state.doc.toString())
      try { await workspace.flushAll() } catch (e) { console.warn('[apply] flush after dispatch failed', e) }
    }

    if (beforeId) {
      try {
        await client.createSnapshot({
          reason: 'after_ai_edit',
          summary: `After apply · ${run.agentLabel}`,
          files: [rel],
          metadata: meta,
        })
        await client.patchSnapshotFiles(beforeId, [rel])
      } catch (e) {
        console.warn('[apply] after snapshot failed', e)
        notifications.showToast(`History snapshot failed: ${(e as Error).message}`)
      }
    }
  }, [workspace, raEnabled, selectionAgent, editorRegistry, notifications])
}
