import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useQuickPick } from './useQuickPick'
import type { Command } from './useCommands'
import type { PaletteFile } from '../types/quick-pick'
import type { CommandRecord } from '../types/extension-contributions'

function makeCommand(id: string, label: string, group = 'View'): Command {
  return { id, label, group, run: vi.fn() }
}

function makeFile(rel: string): PaletteFile {
  const i = rel.lastIndexOf('/')
  return { rel, basename: i >= 0 ? rel.slice(i + 1) : rel }
}

const baseArgs = {
  commands: [
    makeCommand('view.a', 'Toggle Sidebar'),
    makeCommand('view.b', 'Toggle Bottom Panel'),
  ],
  files: [makeFile('chapters/01-opening.md'), makeFile('notes/character.md')],
  recentFiles: [makeFile('notes/character.md')],
  extensionCommands: [] as CommandRecord[],
  onRunCommand: vi.fn(),
  onOpenFile: vi.fn(),
  onInvokeExtensionCommand: vi.fn(),
  onClose: vi.fn(),
}

describe('useQuickPick', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts in commands mode for an empty query', () => {
    const { result } = renderHook(() => useQuickPick({ ...baseArgs, query: '' }))
    expect(result.current.mode).toBe('commands')
    expect(result.current.rows.length).toBeGreaterThan(0)
    expect(result.current.rows[0]?.kind).toBe('command')
  })

  it('switches to files mode when query starts with @', () => {
    const { result } = renderHook(() => useQuickPick({ ...baseArgs, query: '@chap' }))
    expect(result.current.mode).toBe('files')
    expect(result.current.rows[0]?.kind).toBe('file')
    expect(result.current.rows[0]?.label).toBe('01-opening.md')
  })

  it('shows recents when query is exactly "@"', () => {
    const { result } = renderHook(() => useQuickPick({ ...baseArgs, query: '@' }))
    expect(result.current.mode).toBe('files')
    expect(result.current.rows[0]?.kind).toBe('recent')
    expect(result.current.rows[0]?.label).toBe('character.md')
  })

  it('Enter activates the highlighted row', () => {
    const onRunCommand = vi.fn()
    const onClose = vi.fn()
    const { result } = renderHook(() =>
      useQuickPick({ ...baseArgs, query: 'toggle bottom', onRunCommand, onClose })
    )
    act(() => {
      result.current.onKeyDown({
        key: 'Enter',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent)
    })
    expect(onRunCommand).toHaveBeenCalledWith('view.b')
    expect(onClose).toHaveBeenCalled()
  })

  it('ArrowDown advances highlight, ArrowUp retreats', () => {
    const { result } = renderHook(() => useQuickPick({ ...baseArgs, query: 'toggle' }))
    expect(result.current.highlight).toBe(0)
    act(() => {
      result.current.onKeyDown({
        key: 'ArrowDown',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent)
    })
    expect(result.current.highlight).toBe(1)
    act(() => {
      result.current.onKeyDown({
        key: 'ArrowUp',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent)
    })
    expect(result.current.highlight).toBe(0)
  })

  it('Escape fires onClose', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() =>
      useQuickPick({ ...baseArgs, query: 'toggle', onClose })
    )
    act(() => {
      result.current.onKeyDown({
        key: 'Escape',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent)
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('opening a file calls onOpenFile with the rel path', () => {
    const onOpenFile = vi.fn()
    const { result } = renderHook(() =>
      useQuickPick({ ...baseArgs, query: '@chap', onOpenFile })
    )
    act(() => result.current.activate(0))
    expect(onOpenFile).toHaveBeenCalledWith('chapters/01-opening.md')
  })

  it('activating an extension command calls onInvokeExtensionCommand with its id', () => {
    const onInvokeExtensionCommand = vi.fn()
    const extCmds = [
      {
        id: 'ext.foo',
        title: 'Foo from Extension',
        extensionId: 'ext.demo',
        extensionName: 'Demo Extension',
      } as unknown as import('../types/extension-contributions').CommandRecord,
    ]
    const { result } = renderHook(() =>
      useQuickPick({
        ...baseArgs,
        query: 'foo',
        extensionCommands: extCmds,
        onInvokeExtensionCommand,
      })
    )
    // Native commands rank first; the extension command sits after them. Find it.
    const idx = result.current.rows.findIndex((r) => r.kind === 'extensionCommand')
    expect(idx).toBeGreaterThanOrEqual(0)
    act(() => result.current.activate(idx))
    expect(onInvokeExtensionCommand).toHaveBeenCalledWith('ext.foo')
  })
})
