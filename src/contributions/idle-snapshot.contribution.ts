import { DisposableStore, toDisposable } from '../lib/lifecycle'
import { getFs } from '../lib/fs'
import { getCanvHistory } from '../lib/history'
import { registerContribution, type Contribution } from './index'

const IDLE_MS = 10 * 60 * 1000

/**
 * After IDLE_MS of quiet, snapshot any pending workspace changes via
 * CanvHistory. Re-arms after each fire (success or failure). Only active when
 * the workspace's revisionArchaeology config is enabled.
 *
 * Replaces useIdleAutosnapshot. The contribution is re-registered whenever
 * `services` changes identity (e.g. workspace.ready flips), so the snapshot
 * config is re-evaluated lazily without an in-contribution subscribe loop.
 */
export const idleSnapshot: Contribution = {
  name: 'idle-snapshot',
  register(services) {
    const store = new DisposableStore()

    if (!services.workspace.ready || !services.workspace.root) return store

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let enabled = false
    let history: ReturnType<typeof getCanvHistory> | null = null

    const arm = () => {
      if (timer) clearTimeout(timer)
      if (cancelled || !enabled || !history) return
      timer = setTimeout(async () => {
        if (cancelled || !history) return
        try {
          const changes = await history.getCurrentChanges()
          if (cancelled || changes.length === 0) return
          await history.createSnapshot({
            reason: 'idle_autosave',
            summary: 'Idle autosave',
            files: changes.map((c) => c.relPath),
            metadata: {},
          })
        } catch (e) {
          console.warn('[idle-autosnapshot] failed', e)
        } finally {
          arm()
        }
      }, IDLE_MS)
    }

    // Resolve workspace config asynchronously, then start the timer.
    void (async () => {
      try {
        const cfg = await getFs().readWorkspaceConfig()
        if (cancelled) return
        enabled = cfg?.revisionArchaeology.enabled === true
        history = enabled ? getCanvHistory() : null
        arm()
      } catch {
        // Config unreadable — leave the timer disarmed.
      }
    })()

    store.add(toDisposable(() => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }))
    return store
  },
}

registerContribution(idleSnapshot)
