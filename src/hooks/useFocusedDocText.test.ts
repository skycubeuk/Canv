import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFocusedDocText, createLiveDocsChannel } from './useFocusedDocText'

describe('useFocusedDocText', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('returns fallback when no live entry exists', () => {
    const channel = createLiveDocsChannel()
    const { result } = renderHook(() =>
      useFocusedDocText(channel, 'g1:a.md', '# fallback', 250),
    )
    expect(result.current).toBe('# fallback')
  })

  it('returns null when fallback is null and no live entry', () => {
    const channel = createLiveDocsChannel()
    const { result } = renderHook(() =>
      useFocusedDocText(channel, null, null, 250),
    )
    expect(result.current).toBeNull()
  })

  it('returns live entry once published, after debounce', () => {
    const channel = createLiveDocsChannel()
    const store = new Map<string, string>()
    channel.setGetter((k) => store.get(k))
    const { result } = renderHook(() =>
      useFocusedDocText(channel, 'g1:a.md', '# fallback', 250),
    )
    act(() => { store.set('g1:a.md', '# live'); channel.publish('g1:a.md') })
    expect(result.current).toBe('# fallback')
    act(() => { vi.advanceTimersByTime(250) })
    expect(result.current).toBe('# live')
  })

  it('debounces rapid publishes to one update per window', () => {
    const channel = createLiveDocsChannel()
    const store = new Map<string, string>()
    channel.setGetter((k) => store.get(k))
    const { result } = renderHook(() =>
      useFocusedDocText(channel, 'g1:a.md', '', 250),
    )
    act(() => {
      store.set('g1:a.md', 'a');  channel.publish('g1:a.md')
      store.set('g1:a.md', 'ab'); channel.publish('g1:a.md')
      store.set('g1:a.md', 'abc'); channel.publish('g1:a.md')
    })
    expect(result.current).toBe('')
    act(() => { vi.advanceTimersByTime(250) })
    expect(result.current).toBe('abc')
  })

  it('clear drops the stored entry and notifies subscribers', () => {
    const channel = createLiveDocsChannel()
    const store = new Map<string, string>()
    channel.setGetter((k) => store.get(k))
    const listener = vi.fn()
    channel.subscribe(listener)
    store.set('g1:a.md', '# live')
    channel.publish('g1:a.md')
    expect(channel.read('g1:a.md')).toBe('# live')
    channel.clear('g1:a.md')
    expect(channel.read('g1:a.md')).toBeUndefined()
    expect(listener).toHaveBeenLastCalledWith('g1:a.md')
  })

  it('clear on a missing key is a no-op (does not notify)', () => {
    const channel = createLiveDocsChannel()
    const listener = vi.fn()
    channel.subscribe(listener)
    channel.clear('g1:nothing.md')
    expect(listener).not.toHaveBeenCalled()
  })

  it('switching focusedKey returns the new key fallback first', () => {
    const channel = createLiveDocsChannel()
    const store = new Map<string, string>()
    channel.setGetter((k) => store.get(k))
    store.set('g1:a.md', '# live a')
    channel.publish('g1:a.md')
    const { result, rerender } = renderHook(
      ({ key, fb }: { key: string; fb: string }) =>
        useFocusedDocText(channel, key, fb, 250),
      { initialProps: { key: 'g1:a.md', fb: '# fallback a' } },
    )
    act(() => { vi.advanceTimersByTime(250) })
    expect(result.current).toBe('# live a')
    rerender({ key: 'g1:b.md', fb: '# fallback b' })
    expect(result.current).toBe('# fallback b')
    act(() => {
      store.set('g1:b.md', '# live b')
      channel.publish('g1:b.md')
      vi.advanceTimersByTime(250)
    })
    expect(result.current).toBe('# live b')
  })
})
