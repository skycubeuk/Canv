import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSettings } from './useSettings'

describe('useSettings — theme migration', () => {
  beforeEach(() => { localStorage.clear() })

  it("maps legacy theme: 'dark' to 'canv-dark' and drops accent", () => {
    localStorage.setItem('canv:settings', JSON.stringify({ theme: 'dark', accent: '#f43f5e' }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.theme).toBe('canv-dark')
    // Schema no longer has `accent` — it should not appear on the typed object.
    expect('accent' in result.current.settings).toBe(false)
  })

  it("maps legacy theme: 'light' to 'canv-light'", () => {
    localStorage.setItem('canv:settings', JSON.stringify({ theme: 'light' }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.theme).toBe('canv-light')
  })

  it("'system' passes through unchanged", () => {
    localStorage.setItem('canv:settings', JSON.stringify({ theme: 'system' }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.theme).toBe('system')
  })

  it('a new theme id is preserved', () => {
    localStorage.setItem('canv:settings', JSON.stringify({ theme: 'dracula' }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.theme).toBe('dracula')
  })

  it('unknown theme strings fall back to the schema default ("system")', () => {
    localStorage.setItem('canv:settings', JSON.stringify({ theme: 'mystery' }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.theme).toBe('system')
  })
})
