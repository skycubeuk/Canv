import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCommands, normaliseShortcut } from './useCommands'

describe('normaliseShortcut', () => {
  it('canonicalises modifier order and lowercases letters', () => {
    expect(normaliseShortcut('B+CTRL')).toBe('ctrl+b')
    expect(normaliseShortcut('Cmd+Shift+P')).toBe('cmd+shift+p')
    expect(normaliseShortcut('CTRL+CMD+,')).toBe('cmd+ctrl+,')
  })
})

describe('useCommands', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('registers and lists commands', () => {
    const { result } = renderHook(() => useCommands())
    const run = vi.fn()
    let dispose = () => {}
    act(() => {
      dispose = result.current.register({ id: 'test.cmd', label: 'Test', run })
    })
    expect(result.current.list().map((c) => c.id)).toContain('test.cmd')
    act(() => dispose())
    expect(result.current.list().map((c) => c.id)).not.toContain('test.cmd')
  })

  it('runById invokes the command and returns true on success', () => {
    const { result } = renderHook(() => useCommands())
    const run = vi.fn()
    act(() => { result.current.register({ id: 'a', label: 'A', run }) })
    let ok = false
    act(() => { ok = result.current.runById('a') })
    expect(ok).toBe(true)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('runById returns false for unknown id', () => {
    const { result } = renderHook(() => useCommands())
    expect(result.current.runById('missing')).toBe(false)
  })

  it('dispatches keybindings via window keydown when the target is not editable', () => {
    const { result } = renderHook(() => useCommands())
    const run = vi.fn()
    act(() => {
      result.current.register({ id: 'b', label: 'B', shortcut: 'Ctrl+B', run })
    })
    const target = document.body
    act(() => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }))
    })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('skips keybindings when the target is inside a contenteditable', () => {
    const { result } = renderHook(() => useCommands())
    const run = vi.fn()
    act(() => {
      result.current.register({ id: 'c', label: 'C', shortcut: 'Ctrl+B', run })
    })
    const ce = document.createElement('div')
    ce.setAttribute('contenteditable', 'true')
    document.body.appendChild(ce)
    act(() => {
      ce.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }))
    })
    expect(run).not.toHaveBeenCalled()
  })

  it('respects the `when` predicate', () => {
    const { result } = renderHook(() => useCommands())
    const run = vi.fn()
    act(() => {
      result.current.register({ id: 'd', label: 'D', shortcut: 'Ctrl+B', when: () => false, run })
    })
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true }))
    })
    expect(run).not.toHaveBeenCalled()
  })
})
