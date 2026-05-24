import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIdeLayout, DEFAULT_IDE_LAYOUT } from './useIdeLayout'
import { wsKey } from '../lib/wsKey'

const ROOT = '/tmp/canv-test-ws'

function clearLayout() {
  for (const suffix of ['layout:sidebar', 'layout:bottom', 'layout:editor']) {
    localStorage.removeItem(wsKey(ROOT, suffix))
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('useIdeLayout', () => {
  it('returns defaults when no root and no stored value', () => {
    const { result } = renderHook(() => useIdeLayout(null))
    expect(result.current.layout).toEqual(DEFAULT_IDE_LAYOUT)
  })

  it('returns defaults for a fresh workspace', () => {
    const { result } = renderHook(() => useIdeLayout('/ws/a'))
    expect(result.current.layout).toEqual(DEFAULT_IDE_LAYOUT)
  })

  it('toggles sidebar visibility', () => {
    const { result } = renderHook(() => useIdeLayout('/ws/a'))
    expect(result.current.layout.sidebar.visible).toBe(true)
    act(() => result.current.toggleSidebar())
    expect(result.current.layout.sidebar.visible).toBe(false)
    act(() => result.current.toggleSidebar())
    expect(result.current.layout.sidebar.visible).toBe(true)
  })

  it('toggles bottom panel visibility', () => {
    const { result } = renderHook(() => useIdeLayout('/ws/a'))
    expect(result.current.layout.bottom.visible).toBe(false)
    act(() => result.current.toggleBottom())
    expect(result.current.layout.bottom.visible).toBe(true)
  })

  it('sets the active sidebar tab', () => {
    const { result } = renderHook(() => useIdeLayout('/ws/a'))
    act(() => result.current.setSidebarTab('search'))
    expect(result.current.layout.sidebar.activeTab).toBe('search')
  })

  it('accepts the sites tab', () => {
    const { result } = renderHook(() => useIdeLayout('/ws/a'))
    act(() => result.current.setSidebarTab('sites'))
    expect(result.current.layout.sidebar.activeTab).toBe('sites')
  })

  it('sets the active bottom tab and shows the panel if hidden', () => {
    const { result } = renderHook(() => useIdeLayout('/ws/a'))
    act(() => result.current.showBottomTab('chat'))
    expect(result.current.layout.bottom.visible).toBe(true)
    expect(result.current.layout.bottom.activeTab).toBe('chat')
  })

  it('persists state per workspace and restores on remount', () => {
    const { result, unmount } = renderHook(() => useIdeLayout('/ws/a'))
    act(() => result.current.toggleSidebar())
    act(() => result.current.showBottomTab('runs'))
    unmount()

    const { result: result2 } = renderHook(() => useIdeLayout('/ws/a'))
    expect(result2.current.layout.sidebar.visible).toBe(false)
    expect(result2.current.layout.bottom.visible).toBe(true)
    expect(result2.current.layout.bottom.activeTab).toBe('runs')
  })

  it('keeps separate state for separate workspaces', () => {
    const { result: a } = renderHook(() => useIdeLayout('/ws/a'))
    act(() => a.current.toggleSidebar())

    const { result: b } = renderHook(() => useIdeLayout('/ws/b'))
    expect(b.current.layout.sidebar.visible).toBe(true)
  })

  it('reloads layout when the workspace root changes mid-mount', () => {
    // Seed two workspaces with distinct stored state.
    const seed = renderHook(() => useIdeLayout('/ws/a'))
    act(() => seed.result.current.toggleSidebar())
    act(() => seed.result.current.showBottomTab('chat'))
    seed.unmount()

    const seedB = renderHook(() => useIdeLayout('/ws/b'))
    act(() => seedB.result.current.setSidebarTab('search'))
    seedB.unmount()

    // Mount once on /ws/a, then rerender with /ws/b — the same hook instance
    // should pick up B's stored state, not retain A's.
    const { result, rerender } = renderHook(
      ({ root }) => useIdeLayout(root),
      { initialProps: { root: '/ws/a' as string | null } },
    )
    expect(result.current.layout.sidebar.visible).toBe(false)
    expect(result.current.layout.bottom.activeTab).toBe('chat')

    rerender({ root: '/ws/b' })
    expect(result.current.layout.sidebar.visible).toBe(true)
    expect(result.current.layout.sidebar.activeTab).toBe('search')
    expect(result.current.layout.bottom.activeTab).toBe('chat')
  })
})

describe('useIdeLayout — placement', () => {
  beforeEach(clearLayout)

  it('defaults placement to "bottom" and lastDockedPlacement to "bottom"', () => {
    const { result } = renderHook(() => useIdeLayout(ROOT))
    expect(result.current.layout.bottom.placement).toBe('bottom')
    expect(result.current.layout.bottom.lastDockedPlacement).toBe('bottom')
  })

  it('persists placement across hook remounts', () => {
    const { result, unmount } = renderHook(() => useIdeLayout(ROOT))
    act(() => { result.current.setDockPlacement('right') })
    expect(result.current.layout.bottom.placement).toBe('right')
    unmount()
    const { result: result2 } = renderHook(() => useIdeLayout(ROOT))
    expect(result2.current.layout.bottom.placement).toBe('right')
  })

  it('records lastDockedPlacement only when transitioning into popout', () => {
    const { result } = renderHook(() => useIdeLayout(ROOT))
    act(() => { result.current.setDockPlacement('right') })
    expect(result.current.layout.bottom.lastDockedPlacement).toBe('bottom')
    act(() => { result.current.setDockPlacement('popout') })
    expect(result.current.layout.bottom.placement).toBe('popout')
    expect(result.current.layout.bottom.lastDockedPlacement).toBe('right')
    act(() => { result.current.setDockPlacement('bottom') })
    expect(result.current.layout.bottom.placement).toBe('bottom')
    expect(result.current.layout.bottom.lastDockedPlacement).toBe('right')
  })

  it('does not update lastDockedPlacement on bottom <-> right swaps', () => {
    const { result } = renderHook(() => useIdeLayout(ROOT))
    act(() => { result.current.setDockPlacement('right') })
    expect(result.current.layout.bottom.lastDockedPlacement).toBe('bottom')
    act(() => { result.current.setDockPlacement('bottom') })
    expect(result.current.layout.bottom.lastDockedPlacement).toBe('bottom')
  })

  it('default constant exposes the new fields', () => {
    expect(DEFAULT_IDE_LAYOUT.bottom.placement).toBe('bottom')
    expect(DEFAULT_IDE_LAYOUT.bottom.lastDockedPlacement).toBe('bottom')
  })

  it('persists rightSize separately from bottom size', () => {
    const { result, unmount } = renderHook(() => useIdeLayout(ROOT))
    act(() => { result.current.setBottomSize(40) })
    act(() => { result.current.setRightSize(25) })
    expect(result.current.layout.bottom.size).toBe(40)
    expect(result.current.layout.bottom.rightSize).toBe(25)
    unmount()
    const { result: result2 } = renderHook(() => useIdeLayout(ROOT))
    expect(result2.current.layout.bottom.size).toBe(40)
    expect(result2.current.layout.bottom.rightSize).toBe(25)
  })

  it('coerces persisted popout to lastDockedPlacement when canvDock is unavailable (browser build)', () => {
    // Pre-seed localStorage with a stale popout placement
    localStorage.setItem(
      wsKey(ROOT, 'layout:bottom'),
      JSON.stringify({ value: { ...DEFAULT_IDE_LAYOUT.bottom, placement: 'popout', lastDockedPlacement: 'right' } }),
    )
    // jsdom doesn't have window.canvDock; this exercises the browser-build path
    const { result } = renderHook(() => useIdeLayout(ROOT))
    expect(result.current.layout.bottom.placement).toBe('right')
    expect(result.current.layout.bottom.lastDockedPlacement).toBe('right')
  })

  it('coerces popout on workspace switch (not just initial mount)', () => {
    const ROOT2 = '/tmp/canv-test-ws-2'
    localStorage.removeItem(wsKey(ROOT2, 'layout:bottom'))
    localStorage.setItem(
      wsKey(ROOT2, 'layout:bottom'),
      JSON.stringify({ value: { ...DEFAULT_IDE_LAYOUT.bottom, placement: 'popout', lastDockedPlacement: 'bottom' } }),
    )
    const { result, rerender } = renderHook(({ root }) => useIdeLayout(root), { initialProps: { root: ROOT } })
    expect(result.current.layout.bottom.placement).toBe('bottom')
    rerender({ root: ROOT2 })
    expect(result.current.layout.bottom.placement).toBe('bottom')
    // Cleanup
    localStorage.removeItem(wsKey(ROOT2, 'layout:bottom'))
  })
})
