import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useFileHandlerRouting } from './useFileHandlerRouting'

const HANDLER_PDF = { extensionId: 'pdf-viewer', id: 'main', extensions: ['.pdf'], mode: 'viewer' as const, entry: 'p.html' }
const HANDLER_PDF_ALT = { extensionId: 'pdf-alt', id: 'main', extensions: ['.pdf'], mode: 'viewer' as const, entry: 'p.html' }

const EMPTY = { panels: [], fileHandlers: [], commands: [], menus: [], statusBarItems: [], languages: [] }

beforeEach(() => {
  window.canvExtensions = {
    readAllContributions: vi.fn().mockResolvedValue({ ...EMPTY, fileHandlers: [HANDLER_PDF] }),
    onChanged: vi.fn(() => () => {}),
    onCrashed: vi.fn(() => () => {}),
    getFileHandlerDefaults: vi.fn().mockResolvedValue({}),
  } as never
})

describe('useFileHandlerRouting', () => {
  it('returns null when no fileHandler matches', async () => {
    const { result } = renderHook(() => useFileHandlerRouting())
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.resolve('notes.md')).toBeNull()
  })

  it('returns the single matching handler', async () => {
    const { result } = renderHook(() => useFileHandlerRouting())
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.resolve('paper.pdf')?.extensionId).toBe('pdf-viewer')
  })

  it('honours the workspace default when multiple handlers match', async () => {
    ;(window.canvExtensions as unknown as { readAllContributions: ReturnType<typeof vi.fn>; getFileHandlerDefaults: ReturnType<typeof vi.fn> }).readAllContributions.mockResolvedValue({ ...EMPTY, fileHandlers: [HANDLER_PDF, HANDLER_PDF_ALT] })
    ;(window.canvExtensions as unknown as { readAllContributions: ReturnType<typeof vi.fn>; getFileHandlerDefaults: ReturnType<typeof vi.fn> }).getFileHandlerDefaults.mockResolvedValue({ '.pdf': 'pdf-alt' })
    const { result } = renderHook(() => useFileHandlerRouting())
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.resolve('paper.pdf')?.extensionId).toBe('pdf-alt')
  })

  it('falls through to the last handler when no default and multiple match', async () => {
    ;(window.canvExtensions as unknown as { readAllContributions: ReturnType<typeof vi.fn>; getFileHandlerDefaults: ReturnType<typeof vi.fn> }).readAllContributions.mockResolvedValue({ ...EMPTY, fileHandlers: [HANDLER_PDF, HANDLER_PDF_ALT] })
    const { result } = renderHook(() => useFileHandlerRouting())
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.resolve('paper.pdf')?.extensionId).toBe('pdf-alt')
  })

  it('returns all matching handlers for the Open with… submenu', async () => {
    ;(window.canvExtensions as unknown as { readAllContributions: ReturnType<typeof vi.fn>; getFileHandlerDefaults: ReturnType<typeof vi.fn> }).readAllContributions.mockResolvedValue({ ...EMPTY, fileHandlers: [HANDLER_PDF, HANDLER_PDF_ALT] })
    const { result } = renderHook(() => useFileHandlerRouting())
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.list('paper.pdf')).toHaveLength(2)
    expect(result.current.list('notes.md')).toEqual([])
  })
})
