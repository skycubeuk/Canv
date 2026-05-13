import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIdleAutosnapshot } from './useIdleAutosnapshot'

const history = {
  getCurrentChanges: vi.fn(),
  createSnapshot: vi.fn(),
}

beforeEach(() => {
  vi.useFakeTimers()
  history.getCurrentChanges.mockReset()
  history.createSnapshot.mockReset()
  history.createSnapshot.mockResolvedValue({ id: 'snap_idle' })
})
afterEach(() => { vi.useRealTimers() })

describe('useIdleAutosnapshot', () => {
  it('fires after idle window when changes exist', async () => {
    history.getCurrentChanges.mockResolvedValue([{ relPath: 'a.md', status: 'modified' }])
    renderHook(() => useIdleAutosnapshot({ enabled: true, idleMs: 1000, history: history as never }))
    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(history.createSnapshot).toHaveBeenCalledWith(expect.objectContaining({ reason: 'idle_autosave' }))
  })

  it('does not fire when no changes', async () => {
    history.getCurrentChanges.mockResolvedValue([])
    renderHook(() => useIdleAutosnapshot({ enabled: true, idleMs: 1000, history: history as never }))
    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(history.createSnapshot).not.toHaveBeenCalled()
  })

  it('does not fire when disabled', async () => {
    history.getCurrentChanges.mockResolvedValue([{ relPath: 'a.md', status: 'modified' }])
    renderHook(() => useIdleAutosnapshot({ enabled: false, idleMs: 1000, history: history as never }))
    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
    })
    expect(history.createSnapshot).not.toHaveBeenCalled()
  })

  it('touch() resets the idle timer', async () => {
    history.getCurrentChanges.mockResolvedValue([{ relPath: 'a.md', status: 'modified' }])
    const { result } = renderHook(() => useIdleAutosnapshot({ enabled: true, idleMs: 1000, history: history as never }))
    await act(async () => { vi.advanceTimersByTime(900) })
    act(() => result.current.touch())
    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })
    expect(history.createSnapshot).not.toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(1000)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(history.createSnapshot).toHaveBeenCalled()
  })

  it('does nothing when history is null', () => {
    expect(() =>
      renderHook(() => useIdleAutosnapshot({ enabled: true, idleMs: 1000, history: null }))
    ).not.toThrow()
  })
})
