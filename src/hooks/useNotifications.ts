import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface RetryUndoState {
  count: number
  expiresAt: number
}

export interface UseNotificationsApi {
  toast: string | null
  retryUndo: RetryUndoState | null
  showToast: (msg: string) => void
  showRetryUndoToast: (count: number) => void
  dismissRetryUndo: () => void
}

export function useNotifications(): UseNotificationsApi {
  const [toast, setToast] = useState<string | null>(null)
  const [retryUndo, setRetryUndo] = useState<RetryUndoState | null>(null)
  const retryUndoTimer = useRef<number | null>(null)
  const toastTimer = useRef<number | null>(null)

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = window.setTimeout(() => {
      toastTimer.current = null
      setToast(null)
    }, 3000)
  }, [])

  const dismissRetryUndo = useCallback(() => {
    if (retryUndoTimer.current != null) {
      window.clearTimeout(retryUndoTimer.current)
      retryUndoTimer.current = null
    }
    setRetryUndo(null)
  }, [])

  const showRetryUndoToast = useCallback((count: number) => {
    if (retryUndoTimer.current != null) {
      window.clearTimeout(retryUndoTimer.current)
    }
    setRetryUndo({ count, expiresAt: Date.now() + 10_000 })
    retryUndoTimer.current = window.setTimeout(dismissRetryUndo, 10_000)
  }, [dismissRetryUndo])

  useEffect(() => {
    return () => {
      if (retryUndoTimer.current != null) window.clearTimeout(retryUndoTimer.current)
      if (toastTimer.current != null) window.clearTimeout(toastTimer.current)
    }
  }, [])

  return useMemo<UseNotificationsApi>(() => ({
    toast,
    retryUndo,
    showToast,
    showRetryUndoToast,
    dismissRetryUndo,
  }), [toast, retryUndo, showToast, showRetryUndoToast, dismissRetryUndo])
}
