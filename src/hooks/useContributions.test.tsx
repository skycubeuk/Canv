import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { useContributions } from './useContributions'

const EMPTY = { panels: [], fileHandlers: [], commands: [], menus: [], statusBarItems: [], languages: [] }

beforeEach(() => {
  cleanup()
  window.canvExtensions = {
    readAllContributions: vi.fn().mockResolvedValue(EMPTY),
    onChanged: vi.fn(() => () => {}),
    onCrashed: vi.fn(() => () => {}),
  } as unknown as NonNullable<typeof window.canvExtensions>
})

describe('useContributions', () => {
  it('returns empty slices initially while loading', () => {
    const { result } = renderHook(() => useContributions())
    expect(result.current.panels).toEqual([])
  })

  it('returns fetched contributions after initial load', async () => {
    const PAYLOAD = {
      ...EMPTY,
      panels: [{ extensionId: 'wc', id: 'main', title: 'WC', icon: 'x', location: 'left-sidebar', entry: 'x' }],
    }
    ;(window.canvExtensions!.readAllContributions as ReturnType<typeof vi.fn>).mockResolvedValueOnce(PAYLOAD)
    const { result } = renderHook(() => useContributions())
    await waitFor(() => expect(result.current.panels).toHaveLength(1))
  })

  it('refetches when onChanged fires', async () => {
    let onChangedCb: ((() => void) | null) = null
    ;(window.canvExtensions!.onChanged as ReturnType<typeof vi.fn>).mockImplementation((cb: () => void) => {
      onChangedCb = cb
      return () => { onChangedCb = null }
    })
    const { result } = renderHook(() => useContributions())
    await waitFor(() => expect(window.canvExtensions!.readAllContributions).toHaveBeenCalledTimes(1))
    ;(window.canvExtensions!.readAllContributions as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...EMPTY, panels: [{ extensionId: 'x', id: 'p', title: 'P', icon: 'x', location: 'left-sidebar', entry: 'x' }],
    })
    if (onChangedCb) (onChangedCb as () => void)()
    await waitFor(() => expect(result.current.panels).toHaveLength(1))
  })
})
