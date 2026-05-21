import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMcpServerStatus } from './useMcpServerStatus'
import type { McpServerConfig } from '../../../hooks/settingsSchema'

interface CanvMcpWindowApi {
  testServer: (name: string) => Promise<{ ok: true; tools: unknown[] } | { ok: false; error: string }>
  reconnectServer: (name: string) => Promise<{ ok: true; tools: unknown[] } | { ok: false; error: string }>
}

describe('useMcpServerStatus', () => {
  let testServer: ReturnType<typeof vi.fn>
  let reconnectServer: ReturnType<typeof vi.fn>
  let originalCanvMcp: unknown

  beforeEach(() => {
    testServer = vi.fn().mockResolvedValue({ ok: true, tools: [{ name: 'ping', description: '', inputSchema: {} }] })
    reconnectServer = vi.fn().mockResolvedValue({ ok: true, tools: [] })
    originalCanvMcp = (window as unknown as { canvMcp?: CanvMcpWindowApi }).canvMcp
    ;(window as unknown as { canvMcp: CanvMcpWindowApi }).canvMcp = {
      testServer: testServer as unknown as CanvMcpWindowApi['testServer'],
      reconnectServer: reconnectServer as unknown as CanvMcpWindowApi['reconnectServer'],
    }
  })

  afterEach(() => {
    if (originalCanvMcp === undefined) delete (window as unknown as { canvMcp?: unknown }).canvMcp
    else (window as unknown as { canvMcp: unknown }).canvMcp = originalCanvMcp
  })

  const validCfg: McpServerConfig = { name: 'live', transport: 'stdio', command: 'echo' }
  function noopOnCollapsed(_cb: () => void) { return () => {} }

  it('boot test fires for a valid config and transitions idle → testing → connected', async () => {
    const { result } = renderHook(() => useMcpServerStatus(validCfg, noopOnCollapsed))
    // Initial render may already be in 'testing' because the effect fires synchronously.
    await waitFor(() => expect(result.current.status.kind).toBe('connected'))
    expect(testServer).toHaveBeenCalledWith('live')
    expect(testServer).toHaveBeenCalledTimes(1)
  })

  it('stays idle for an invalid (partial) config', async () => {
    const partial = { name: '', transport: 'stdio', command: '' } as unknown as McpServerConfig
    const { result } = renderHook(() => useMcpServerStatus(partial, noopOnCollapsed))
    // Give any pending microtasks a chance to flush.
    await new Promise((r) => setTimeout(r, 10))
    expect(result.current.status.kind).toBe('idle')
    expect(testServer).not.toHaveBeenCalled()
  })

  it('transitions to failed and surfaces the error when testServer returns ok:false', async () => {
    testServer.mockResolvedValueOnce({ ok: false, error: 'ECONNREFUSED' })
    const { result } = renderHook(() => useMcpServerStatus(validCfg, noopOnCollapsed))
    await waitFor(() => expect(result.current.status.kind).toBe('failed'))
    if (result.current.status.kind !== 'failed') return
    expect(result.current.status.error).toBe('ECONNREFUSED')
  })

  it('fires a new test on collapse when configHash changes', async () => {
    // Use an "observable" onCollapsed shim so the test can fire it on demand.
    let storedCb: (() => void) | null = null
    const onCollapsed = (cb: () => void) => { storedCb = cb; return () => { storedCb = null } }

    const { result, rerender } = renderHook(
      ({ cfg }: { cfg: McpServerConfig }) => useMcpServerStatus(cfg, onCollapsed),
      { initialProps: { cfg: validCfg } },
    )
    await waitFor(() => expect(result.current.status.kind).toBe('connected'))
    expect(testServer).toHaveBeenCalledTimes(1)

    // Change the cfg WITHOUT re-firing collapse — nothing should happen.
    rerender({ cfg: { ...validCfg, args: ['--flag'] } })
    expect(testServer).toHaveBeenCalledTimes(1)

    // Fire collapse — should re-test because hash changed.
    act(() => { storedCb?.() })
    await waitFor(() => expect(testServer).toHaveBeenCalledTimes(2))
  })

  it('does NOT re-test on collapse when configHash is unchanged since last test', async () => {
    let storedCb: (() => void) | null = null
    const onCollapsed = (cb: () => void) => { storedCb = cb; return () => { storedCb = null } }
    const { result } = renderHook(() => useMcpServerStatus(validCfg, onCollapsed))
    await waitFor(() => expect(result.current.status.kind).toBe('connected'))
    expect(testServer).toHaveBeenCalledTimes(1)

    act(() => { storedCb?.() })
    // Give any pending microtask a chance.
    await new Promise((r) => setTimeout(r, 10))
    expect(testServer).toHaveBeenCalledTimes(1)
  })

  it('retry() always re-tests via reconnectServer (even when hash is unchanged)', async () => {
    const { result } = renderHook(() => useMcpServerStatus(validCfg, noopOnCollapsed))
    await waitFor(() => expect(result.current.status.kind).toBe('connected'))
    expect(reconnectServer).not.toHaveBeenCalled()

    await act(async () => { await result.current.retry() })
    expect(reconnectServer).toHaveBeenCalledWith('live')
    expect(reconnectServer).toHaveBeenCalledTimes(1)
  })

  it('unmount cancels a pending in-flight test (no setState-after-unmount warning)', async () => {
    // Block the test promise so we can unmount mid-flight.
    let resolveTest: (v: { ok: true; tools: [] }) => void = () => {}
    testServer.mockReturnValue(new Promise((resolve) => { resolveTest = resolve }))

    const { unmount } = renderHook(() => useMcpServerStatus(validCfg, noopOnCollapsed))
    unmount()
    resolveTest({ ok: true, tools: [] })
    // No throw, no console error. Vitest's React adapter would otherwise log
    // "Can't perform a React state update on an unmounted component".
    await new Promise((r) => setTimeout(r, 10))
  })
})
