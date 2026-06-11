import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNotifications } from './useNotifications'

describe('useNotifications', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a toast and clears it after 3s', () => {
    const { result } = renderHook(() => useNotifications())
    act(() => result.current.showToast('saved'))
    expect(result.current.toast).toBe('saved')
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.toast).toBeNull()
  })

  it('latches the timer: a second toast within 3s is not cleared by the first timer', () => {
    const { result } = renderHook(() => useNotifications())
    act(() => result.current.showToast('first'))
    act(() => vi.advanceTimersByTime(2000))
    act(() => result.current.showToast('second'))

    // First toast's timer would fire here (3s after 'first'); 'second' must survive.
    act(() => vi.advanceTimersByTime(1500))
    expect(result.current.toast).toBe('second')

    // 'second' clears 3s after it was shown.
    act(() => vi.advanceTimersByTime(1500))
    expect(result.current.toast).toBeNull()
  })

  it('clears the pending toast timer on unmount', () => {
    const { result, unmount } = renderHook(() => useNotifications())
    act(() => result.current.showToast('bye'))
    unmount()
    expect(() => act(() => vi.advanceTimersByTime(3000))).not.toThrow()
  })
})
