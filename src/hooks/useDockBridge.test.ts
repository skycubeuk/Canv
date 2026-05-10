import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDockBridge } from './useDockBridge'
import type { CanvDockBridge, DockState, UserAction } from '../lib/dockTypes'

function makeMockBridge(): CanvDockBridge {
  const stateSubscribers: Array<(s: DockState) => void> = []
  const actionSubscribers: Array<(a: UserAction) => void> = []
  const closeSubscribers: Array<() => void> = []
  const readySubscribers: Array<() => void> = []
  return {
    openPopout: vi.fn(async () => {}),
    closePopout: vi.fn(async () => {}),
    pushState: vi.fn((s) => { for (const cb of stateSubscribers) cb(s) }),
    onUserAction: (cb) => { actionSubscribers.push(cb); return () => { /* unsubscribe ignored in tests */ } },
    onPopoutClosed: (cb) => { closeSubscribers.push(cb); return () => {} },
    onPopoutReady: (cb) => { readySubscribers.push(cb); return () => {} },
    onState: (cb) => { stateSubscribers.push(cb); return () => {} },
    sendAction: vi.fn((a) => { for (const cb of actionSubscribers) cb(a) }),
    ready: vi.fn(() => { for (const cb of readySubscribers) cb() }),
  }
}

describe('useDockBridge — browser (no canvDock)', () => {
  beforeEach(() => { delete (window as { canvDock?: unknown }).canvDock })

  it('returns a no-op shape', () => {
    const { result } = renderHook(() => useDockBridge({ mode: 'main' }))
    expect(result.current.isAvailable).toBe(false)
    expect(typeof result.current.broadcastState).toBe('function')
    expect(typeof result.current.openPopout).toBe('function')
    // Should not throw.
    result.current.broadcastState({} as DockState)
  })
})

describe('useDockBridge — main mode (Electron)', () => {
  let bridge: CanvDockBridge
  beforeEach(() => {
    bridge = makeMockBridge()
    ;(window as { canvDock?: CanvDockBridge }).canvDock = bridge
  })
  afterEach(() => { delete (window as { canvDock?: unknown }).canvDock })

  it('forwards broadcastState to bridge.pushState', () => {
    const { result } = renderHook(() => useDockBridge({ mode: 'main' }))
    const snapshot = { activeTab: 'runs' } as DockState
    act(() => { result.current.broadcastState(snapshot) })
    expect(bridge.pushState).toHaveBeenCalledWith(snapshot)
  })

  it('throttles broadcastState to ~30fps (skips duplicate calls inside 33ms)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const { result } = renderHook(() => useDockBridge({ mode: 'main' }))
    const snap = (n: number) => ({ activeTab: 'runs', _v: n } as unknown as DockState)
    act(() => { result.current.broadcastState(snap(1)) })
    act(() => { result.current.broadcastState(snap(2)) })
    act(() => { result.current.broadcastState(snap(3)) })
    expect(bridge.pushState).toHaveBeenCalledTimes(1)
    expect(bridge.pushState).toHaveBeenLastCalledWith(snap(1))
    await act(async () => { vi.advanceTimersByTime(40) })
    expect(bridge.pushState).toHaveBeenCalledTimes(2)
    expect(bridge.pushState).toHaveBeenLastCalledWith(snap(3))
    vi.useRealTimers()
  })

  it('routes setActionHandler callback to bridge.onUserAction', () => {
    const { result } = renderHook(() => useDockBridge({ mode: 'main' }))
    const handler = vi.fn()
    act(() => { result.current.setActionHandler(handler) })
    // Simulate the pop-out sending an action.
    act(() => { bridge.sendAction({ type: 'select-tab', tabId: 'chat' }) })
    expect(handler).toHaveBeenCalledWith({ type: 'select-tab', tabId: 'chat' })
  })

  it('routes setPopoutReadyHandler callback to bridge.onPopoutReady', () => {
    const { result } = renderHook(() => useDockBridge({ mode: 'main' }))
    const handler = vi.fn()
    act(() => { result.current.setPopoutReadyHandler(handler) })
    // Trigger ready via the bridge — popout-side mock invokes its readySubscribers when bridge.ready() is called
    act(() => { bridge.ready() })
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('useDockBridge — popout mode', () => {
  let bridge: CanvDockBridge
  beforeEach(() => {
    bridge = makeMockBridge()
    ;(window as { canvDock?: CanvDockBridge }).canvDock = bridge
  })
  afterEach(() => { delete (window as { canvDock?: unknown }).canvDock })

  it('calls bridge.ready() once on mount', () => {
    renderHook(() => useDockBridge({ mode: 'popout' }))
    expect(bridge.ready).toHaveBeenCalledTimes(1)
  })

  it('routes setStateHandler callback to bridge.onState', () => {
    const { result } = renderHook(() => useDockBridge({ mode: 'popout' }))
    const handler = vi.fn()
    act(() => { result.current.setStateHandler(handler) })
    act(() => { bridge.pushState({ activeTab: 'runs' } as DockState) })
    expect(handler).toHaveBeenCalledWith({ activeTab: 'runs' })
  })

  it('forwards sendAction to bridge.sendAction', () => {
    const { result } = renderHook(() => useDockBridge({ mode: 'popout' }))
    act(() => { result.current.sendAction({ type: 'send-chat', text: 'hi' }) })
    expect(bridge.sendAction).toHaveBeenCalledWith({ type: 'send-chat', text: 'hi' })
  })

  it('replays buffered state when setStateHandler is called after a snapshot arrives', () => {
    const { result } = renderHook(() => useDockBridge({ mode: 'popout' }))
    // Simulate state arriving before the consumer registers its handler
    act(() => { bridge.pushState({ activeTab: 'runs' } as DockState) })
    const handler = vi.fn()
    act(() => { result.current.setStateHandler(handler) })
    expect(handler).toHaveBeenCalledWith({ activeTab: 'runs' })
  })
})
