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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const argsRef = useRef(args)
  argsRef.current = args

  const arm = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!argsRef.current.enabled || !argsRef.current.history) return
    timerRef.current = setTimeout(async () => {
      const { history } = argsRef.current
      if (!history) return
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
        arm()
      }
    }, argsRef.current.idleMs)
  }, [])

  useEffect(() => {
    arm()
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [arm, args.enabled, args.idleMs, args.history])

  const touch = useCallback(() => arm(), [arm])
  return { touch }
}
