import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ServicesContext, useService, useAllServices } from './useService'
import type { ICanvServices } from './index'

function withMockServices(stub: Partial<ICanvServices>) {
  return ({ children }: { children: ReactNode }) => (
    <ServicesContext.Provider value={stub as ICanvServices}>{children}</ServicesContext.Provider>
  )
}

describe('useService', () => {
  it('returns the requested service from context', () => {
    const fakeDialogs = { confirm: vi.fn() } as unknown as ICanvServices['dialogs']
    const { result } = renderHook(() => useService('dialogs'), {
      wrapper: withMockServices({ dialogs: fakeDialogs }),
    })
    expect(result.current).toBe(fakeDialogs)
  })

  it('throws a clear error when called outside ServicesProvider', () => {
    expect(() => renderHook(() => useService('workspace'))).toThrowError(
      /useService.*outside ServicesProvider/,
    )
  })
})

describe('useAllServices', () => {
  it('returns the full registry from context', () => {
    const stub = { dialogs: { confirm: vi.fn() } } as unknown as ICanvServices
    const { result } = renderHook(() => useAllServices(), { wrapper: withMockServices(stub) })
    expect(result.current).toBe(stub)
  })

  it('throws outside ServicesProvider', () => {
    expect(() => renderHook(() => useAllServices())).toThrowError(/outside ServicesProvider/)
  })
})
