import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRef, type ReactNode } from 'react'
import { ServicesStoreContext, useService, useAllServices } from './useService'
import { createServicesStore, type ServicesStore } from './servicesStore'
import type { ICanvServices } from './index'

function withMockServices(stub: Partial<ICanvServices>) {
  const store = createServicesStore(stub as ICanvServices)
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <ServicesStoreContext.Provider value={store}>{children}</ServicesStoreContext.Provider>
  )
  return { Wrapper, store }
}

describe('useService', () => {
  it('returns the requested service from the store', () => {
    const fakeDialogs = { confirm: vi.fn() } as unknown as ICanvServices['dialogs']
    const { Wrapper } = withMockServices({ dialogs: fakeDialogs })
    const { result } = renderHook(() => useService('dialogs'), { wrapper: Wrapper })
    expect(result.current).toBe(fakeDialogs)
  })

  it('throws a clear error when called outside ServicesProvider', () => {
    expect(() => renderHook(() => useService('workspace'))).toThrowError(
      /useService.*outside ServicesProvider/,
    )
  })

  it('re-renders only when the subscribed key changes', () => {
    const wsA = { tag: 'wsA' } as unknown as ICanvServices['workspace']
    const wsB = { tag: 'wsB' } as unknown as ICanvServices['workspace']
    const statsA = { wordCount: 1 } as unknown as ICanvServices['editorStats']
    const statsB = { wordCount: 2 } as unknown as ICanvServices['editorStats']

    const { Wrapper, store } = withMockServices({ workspace: wsA, editorStats: statsA })

    let wsRenders = 0
    renderHook(
      () => {
        wsRenders++
        return useService('workspace')
      },
      { wrapper: Wrapper },
    )
    const initialRenders = wsRenders

    // editorStats churns: workspace consumer must NOT re-render.
    act(() => {
      store.update({ workspace: wsA, editorStats: statsB } as ICanvServices)
    })
    expect(wsRenders).toBe(initialRenders)

    // workspace ref changes: consumer DOES re-render and sees the new value.
    act(() => {
      store.update({ workspace: wsB, editorStats: statsB } as ICanvServices)
    })
    expect(wsRenders).toBe(initialRenders + 1)
  })
})

describe('useAllServices', () => {
  it('returns the full registry from the store', () => {
    const stub = { dialogs: { confirm: vi.fn() } } as unknown as ICanvServices
    const { Wrapper } = withMockServices(stub)
    const { result } = renderHook(() => useAllServices(), { wrapper: Wrapper })
    expect(result.current).toBe(stub)
  })

  it('re-renders on any services identity change', () => {
    const a = { dialogs: {} } as unknown as ICanvServices
    const b = { dialogs: {} } as unknown as ICanvServices
    const store: ServicesStore = createServicesStore(a)
    const Wrapper = ({ children }: { children: ReactNode }) => {
      const ref = useRef(store)
      return <ServicesStoreContext.Provider value={ref.current}>{children}</ServicesStoreContext.Provider>
    }
    let renders = 0
    const { result } = renderHook(
      () => {
        renders++
        return useAllServices()
      },
      { wrapper: Wrapper },
    )
    expect(result.current).toBe(a)
    const before = renders
    act(() => { store.update(b) })
    expect(result.current).toBe(b)
    expect(renders).toBe(before + 1)
  })

  it('throws outside ServicesProvider', () => {
    expect(() => renderHook(() => useAllServices())).toThrowError(/outside ServicesProvider/)
  })
})
