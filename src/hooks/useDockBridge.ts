import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { DockState, UserAction } from '../lib/dockTypes'

const THROTTLE_MS = 33 // ~30fps

interface MainOptions { mode: 'main' }
interface PopoutOptions { mode: 'popout' }

interface MainApi {
  isAvailable: boolean
  /** Throttled. The first call fires immediately; subsequent calls within THROTTLE_MS coalesce, with the last value winning. */
  broadcastState: (state: DockState) => void
  openPopout: () => Promise<void>
  closePopout: () => Promise<void>
  /** Set the handler for user actions originating in the pop-out window. Calling again replaces the previous handler. */
  setActionHandler: (cb: (action: UserAction) => void) => void
  /** Set the handler for pop-out close events (external close button, OS quit, crash). Calling again replaces the previous handler. */
  setPopoutClosedHandler: (cb: () => void) => void
  /** Set the handler for pop-out ready events (the pop-out window has finished mounting). Calling again replaces the previous handler. */
  setPopoutReadyHandler: (cb: () => void) => void
}

interface PopoutApi {
  isAvailable: boolean
  /** Set the handler for state snapshots from main. Calling again replaces the previous handler. */
  setStateHandler: (cb: (state: DockState) => void) => void
  /** Send a user action to main. */
  sendAction: (action: UserAction) => void
}

export function useDockBridge(opts: MainOptions): MainApi
export function useDockBridge(opts: PopoutOptions): PopoutApi
export function useDockBridge(opts: MainOptions | PopoutOptions): MainApi | PopoutApi {
  const bridge = typeof window !== 'undefined' ? window.canvDock : undefined
  const isAvailable = !!bridge

  // Throttle state for main mode.
  const lastSendAtRef = useRef<number>(0)
  const pendingRef = useRef<DockState | null>(null)
  const trailingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Stable subscriber registries (last-wins).
  const actionHandlerRef = useRef<((a: UserAction) => void) | null>(null)
  const stateHandlerRef = useRef<((s: DockState) => void) | null>(null)
  const closedHandlerRef = useRef<(() => void) | null>(null)
  const readyHandlerRef = useRef<(() => void) | null>(null)

  // Buffer the latest popout-mode state snapshot so that handler registration
  // is order-independent: if main pushes a snapshot before the consumer calls
  // setStateHandler, we replay the latest buffered value when the handler is
  // installed. Eliminates a race between the bridge.ready() ping and the
  // consumer's handler-setup effect.
  const bufferedStateRef = useRef<DockState | null>(null)

  // Wire bridge subscriptions for main.
  useEffect(() => {
    if (opts.mode !== 'main' || !bridge) return
    const offAction = bridge.onUserAction((a) => { actionHandlerRef.current?.(a) })
    const offClosed = bridge.onPopoutClosed(() => { closedHandlerRef.current?.() })
    const offReady = bridge.onPopoutReady(() => { readyHandlerRef.current?.() })
    return () => { offAction(); offClosed(); offReady() }
  }, [bridge, opts.mode])

  // Wire bridge subscription + ready ping for popout.
  useEffect(() => {
    if (opts.mode !== 'popout' || !bridge) return
    const offState = bridge.onState((s) => {
      bufferedStateRef.current = s
      stateHandlerRef.current?.(s)
    })
    bridge.ready()
    return () => { offState() }
  }, [bridge, opts.mode])

  // Cleanup throttle timer.
  useEffect(() => () => {
    if (trailingTimerRef.current) clearTimeout(trailingTimerRef.current)
  }, [])

  const broadcastState = useCallback((state: DockState) => {
    if (!bridge) return
    const now = Date.now()
    const delta = now - lastSendAtRef.current
    if (delta >= THROTTLE_MS) {
      lastSendAtRef.current = now
      pendingRef.current = null
      bridge.pushState(state)
      return
    }
    // Coalesce: store last value; schedule a single trailing flush.
    pendingRef.current = state
    if (trailingTimerRef.current == null) {
      trailingTimerRef.current = setTimeout(() => {
        trailingTimerRef.current = null
        const pending = pendingRef.current
        pendingRef.current = null
        if (pending && bridge) {
          lastSendAtRef.current = Date.now()
          bridge.pushState(pending)
        }
      }, THROTTLE_MS - delta)
    }
  }, [bridge])

  const openPopout = useCallback(async () => {
    if (!bridge) return
    await bridge.openPopout()
  }, [bridge])

  const closePopout = useCallback(async () => {
    if (!bridge) return
    await bridge.closePopout()
  }, [bridge])

  const setActionHandler = useCallback((cb: (a: UserAction) => void) => {
    actionHandlerRef.current = cb
  }, [])

  const setPopoutClosedHandler = useCallback((cb: () => void) => {
    closedHandlerRef.current = cb
  }, [])

  const setPopoutReadyHandler = useCallback((cb: () => void) => {
    readyHandlerRef.current = cb
  }, [])

  const setStateHandler = useCallback((cb: (s: DockState) => void) => {
    stateHandlerRef.current = cb
    // If state arrived before the handler was set, replay it now so the
    // first snapshot isn't dropped on a registration race.
    const buffered = bufferedStateRef.current
    if (buffered) cb(buffered)
  }, [])

  const sendAction = useCallback((a: UserAction) => {
    if (!bridge) return
    bridge.sendAction(a)
  }, [bridge])

  return useMemo(() => {
    if (opts.mode === 'main') {
      const api: MainApi = {
        isAvailable,
        broadcastState,
        openPopout,
        closePopout,
        setActionHandler,
        setPopoutClosedHandler,
        setPopoutReadyHandler,
      }
      return api
    }
    const api: PopoutApi = { isAvailable, setStateHandler, sendAction }
    return api
  }, [
    opts.mode,
    isAvailable,
    broadcastState,
    openPopout,
    closePopout,
    setActionHandler,
    setPopoutClosedHandler,
    setPopoutReadyHandler,
    setStateHandler,
    sendAction,
  ])
}
