import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useWorkspaceSetup } from './useWorkspaceSetup'

const fs = {
  readWorkspaceConfig: vi.fn(),
  writeWorkspaceConfig: vi.fn().mockResolvedValue(true),
}
const history = { init: vi.fn().mockResolvedValue({ branch: 'canv-history', headCommit: 'abc' }) }

beforeEach(() => {
  fs.readWorkspaceConfig.mockReset()
  fs.writeWorkspaceConfig.mockClear()
  history.init.mockClear()
})

describe('useWorkspaceSetup', () => {
  it('phase is ready when a config already exists', async () => {
    fs.readWorkspaceConfig.mockResolvedValue({
      schemaVersion: 1, createdAt: 't', defaultProfile: 'fiction',
      revisionArchaeology: { enabled: false },
    })
    const { result } = renderHook(() =>
      useWorkspaceSetup({ workspaceReady: true, remote: false, fs: fs as never, history: history as never, defaultModeId: 'fiction' }))
    await waitFor(() => expect(result.current.phase).toBe('ready'))
    expect(result.current.config?.defaultProfile).toBe('fiction')
  })

  it('phase is needs-setup when config missing', async () => {
    fs.readWorkspaceConfig.mockResolvedValue(null)
    const { result } = renderHook(() =>
      useWorkspaceSetup({ workspaceReady: true, remote: false, fs: fs as never, history: history as never, defaultModeId: 'fiction' }))
    await waitFor(() => expect(result.current.phase).toBe('needs-setup'))
  })

  it('confirm writes config and triggers history.init when RA enabled', async () => {
    fs.readWorkspaceConfig.mockResolvedValue(null)
    const { result } = renderHook(() =>
      useWorkspaceSetup({ workspaceReady: true, remote: false, fs: fs as never, history: history as never, defaultModeId: 'fiction' }))
    await waitFor(() => expect(result.current.phase).toBe('needs-setup'))
    await act(async () => { await result.current.confirm({ defaultProfile: 'fiction', enableRA: true }) })
    expect(fs.writeWorkspaceConfig).toHaveBeenCalledWith(expect.objectContaining({
      schemaVersion: 1, defaultProfile: 'fiction',
      revisionArchaeology: { enabled: true, backend: 'git-branch', branch: 'canv-history' },
    }))
    expect(history.init).toHaveBeenCalled()
    expect(result.current.phase).toBe('ready')
  })

  it('confirm with RA disabled writes config but skips history.init', async () => {
    fs.readWorkspaceConfig.mockResolvedValue(null)
    const { result } = renderHook(() =>
      useWorkspaceSetup({ workspaceReady: true, remote: false, fs: fs as never, history: history as never, defaultModeId: 'fiction' }))
    await waitFor(() => expect(result.current.phase).toBe('needs-setup'))
    await act(async () => { await result.current.confirm({ defaultProfile: 'fiction', enableRA: false }) })
    expect(history.init).not.toHaveBeenCalled()
    expect(result.current.phase).toBe('ready')
  })

  it('remote workspace forces RA disabled even when enableRA=true', async () => {
    fs.readWorkspaceConfig.mockResolvedValue(null)
    const { result } = renderHook(() =>
      useWorkspaceSetup({ workspaceReady: true, remote: true, fs: fs as never, history: history as never, defaultModeId: 'fiction' }))
    await waitFor(() => expect(result.current.phase).toBe('needs-setup'))
    await act(async () => { await result.current.confirm({ defaultProfile: 'fiction', enableRA: true }) })
    const cfg = fs.writeWorkspaceConfig.mock.calls[0][0]
    expect(cfg.revisionArchaeology).toEqual({ enabled: false })
    expect(history.init).not.toHaveBeenCalled()
  })
})
