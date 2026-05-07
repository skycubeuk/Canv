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

describe('useSettings — pricingOverrides', () => {
  beforeEach(() => { localStorage.clear() })

  it('defaults to an empty object', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.pricingOverrides).toEqual({})
  })

  it('persists overrides via update()', () => {
    const { result } = renderHook(() => useSettings())
    act(() => {
      result.current.update({ pricingOverrides: { 'claude-sonnet-4-6': { input: 4, output: 20 } } })
    })
    const { result: r2 } = renderHook(() => useSettings())
    expect(r2.current.settings.pricingOverrides['claude-sonnet-4-6']).toEqual({ input: 4, output: 20 })
  })

  it('drops persisted entries with non-finite values', () => {
    localStorage.setItem('canv:settings', JSON.stringify({
      pricingOverrides: {
        'm-good': { input: 3, output: 15 },
        'm-bad':  { input: Number.NaN, output: 20 },
      },
    }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.pricingOverrides).toEqual({ 'm-good': { input: 3, output: 15 } })
  })
})

describe('useSettings — streamChunkDelayMs', () => {
  beforeEach(() => { localStorage.clear() })

  it('defaults to 0', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.streamChunkDelayMs).toBe(0)
  })

  it('persists supported values', () => {
    const { result } = renderHook(() => useSettings())
    act(() => { result.current.update({ streamChunkDelayMs: 100 }) })
    const { result: r2 } = renderHook(() => useSettings())
    expect(r2.current.settings.streamChunkDelayMs).toBe(100)
  })

  it('clamps unsupported persisted values to 0', () => {
    localStorage.setItem('canv:settings', JSON.stringify({ streamChunkDelayMs: 999 }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.streamChunkDelayMs).toBe(0)
  })
})

describe('useSettings — accent', () => {
  beforeEach(() => { localStorage.clear() })

  it('defaults accent to indigo (#6366f1)', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.accent).toBe('#6366f1')
  })

  it('persists a new accent value', () => {
    const { result } = renderHook(() => useSettings())
    act(() => { result.current.update({ accent: '#10b981' }) })
    expect(result.current.settings.accent).toBe('#10b981')
  })
})
