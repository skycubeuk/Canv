import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { ExtensionPromptModal } from './ExtensionPromptModal'

type PromptHandler = (reqId: number, req: unknown) => void
let promptHandler: PromptHandler | null = null

beforeEach(() => {
  cleanup()
  promptHandler = null
  window.canvExtensions = {
    onPromptRequest: vi.fn((cb: PromptHandler) => { promptHandler = cb; return () => { promptHandler = null } }),
    promptResolve: vi.fn(),
    getFileHandlerDefaults: vi.fn().mockResolvedValue({}) as never,
    setFileHandlerDefault: vi.fn().mockResolvedValue(undefined) as never,
  } as never
})

describe('ExtensionPromptModal', () => {
  it('renders nothing until a request comes in', () => {
    render(<ExtensionPromptModal />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows quickPick items when request kind is quickPick', () => {
    render(<ExtensionPromptModal />)
    act(() => {
      promptHandler!(1, { kind: 'quickPick', extensionId: 'ext', items: [
        { label: 'Alpha', value: 'a' }, { label: 'Beta', value: 'b' },
      ]})
    })
    expect(screen.getByText('Alpha')).toBeTruthy()
    expect(screen.getByText('Beta')).toBeTruthy()
  })

  it('quickPick click resolves with the chosen value', () => {
    render(<ExtensionPromptModal />)
    act(() => {
      promptHandler!(7, { kind: 'quickPick', extensionId: 'ext', items: [
        { label: 'Alpha', value: 'a' }, { label: 'Beta', value: 'b' },
      ]})
    })
    fireEvent.click(screen.getByText('Beta'))
    expect((window.canvExtensions!.promptResolve as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(7, { value: 'b' })
  })

  it('Escape cancels with null', () => {
    render(<ExtensionPromptModal />)
    act(() => {
      promptHandler!(3, { kind: 'input', extensionId: 'ext', prompt: 'name?' })
    })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect((window.canvExtensions!.promptResolve as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(3, null)
  })

  it('input Enter resolves with typed text', () => {
    render(<ExtensionPromptModal />)
    act(() => {
      promptHandler!(9, { kind: 'input', extensionId: 'ext', prompt: 'name?', placeholder: 'your name' })
    })
    const input = screen.getByPlaceholderText('your name') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Graeme' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect((window.canvExtensions!.promptResolve as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(9, { value: 'Graeme' })
  })

  it('quickPick filter narrows the visible items', () => {
    render(<ExtensionPromptModal />)
    act(() => {
      promptHandler!(11, { kind: 'quickPick', extensionId: 'ext', items: [
        { label: 'apple', value: 1 },
        { label: 'banana', value: 2 },
        { label: 'cherry', value: 3 },
      ], placeholder: 'fruit' })
    })
    const filter = screen.getByPlaceholderText('fruit') as HTMLInputElement
    fireEvent.change(filter, { target: { value: 'an' } })
    // 'banana' matches 'an'; 'apple' and 'cherry' don't.
    expect(screen.queryByText('apple')).toBeNull()
    expect(screen.getByText('banana')).toBeTruthy()
    expect(screen.queryByText('cherry')).toBeNull()
  })
})
