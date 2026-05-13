import { useCallback, useEffect, useRef } from 'react'
import type { CanvHistory } from '../lib/history'

export interface UseIdleAutosnapshotArgs {
  enabled: boolean
  idleMs: number
  history: CanvHistory | null
}

export interface UseIdleAutosnapshotApi {
  touch: () => void
}

export function useIdleAutosnapshot(args: UseIdleAutosnapshotArgs): UseIdleAutosnapshotApi {
  const { enabled, idleMs, history } = args
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const armRef = useRef<() => void>(() => {})

  const arm = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!enabled || !history) return
    timerRef.current = setTimeout(async () => {
      try {
        const changes = await history.getCurrentChanges()
        if (changes.length === 0) return
        await history.createSnapshot({
          reason: 'idle_autosave',
          summary: 'Idle autosave',
          files: changes.map((c) => c.relPath),
          metadata: {},
        })
      } catch (e) {
        console.warn('[idle-autosnapshot] failed', e)
      } finally {
        armRef.current()
      }
    }, idleMs)
  }, [enabled, history, idleMs])

  useEffect(() => {
    armRef.current = arm
    arm()
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [arm])

  return { touch: arm }
}
