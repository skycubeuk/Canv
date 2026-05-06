import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSettings } from './useSettings'

describe('useSettings — chatToolBudget', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to 10', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.chatToolBudget).toBe(10)
  })

  it('persists overrides', () => {
    const { result } = renderHook(() => useSettings())
    act(() => result.current.update({ chatToolBudget: 5 }))
    expect(result.current.settings.chatToolBudget).toBe(5)
  })
})
