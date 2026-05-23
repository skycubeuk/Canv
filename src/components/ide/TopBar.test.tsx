import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { TopBar } from './TopBar'
import type { Command } from '../../hooks/useCommands'
import type { PaletteFile } from '../../types/quick-pick'

const cmds: Command[] = [
  { id: 'view.toggleSidebar', label: 'View: Toggle Sidebar', group: 'View', run: vi.fn() },
  { id: 'view.toggleBottom', label: 'View: Toggle Bottom Panel', group: 'View', run: vi.fn() },
]

const files: PaletteFile[] = [
  { rel: 'chapters/01-opening.md', basename: '01-opening.md' },
  { rel: 'notes/character.md', basename: 'character.md' },
]

const recents: PaletteFile[] = [{ rel: 'notes/character.md', basename: 'character.md' }]

const baseProps = {
  workspaceName: 'UntitledBook',
  bottomVisible: false,
  bottomPlacement: 'bottom' as const,
  onSetBottomPlacementBottom: vi.fn(),
  onSetBottomPlacementRight: vi.fn(),
  commands: cmds,
  files,
  recentFiles: recents,
  extensionCommands: [],
  onRunCommand: vi.fn(),
  onOpenFile: vi.fn(),
  onInvokeExtensionCommand: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TopBar', () => {
  it('renders the Canv identity cluster with workspace name', () => {
    render(<TopBar {...baseProps} />)
    expect(screen.getByText('Canv')).toBeInTheDocument()
    expect(screen.getByText('UntitledBook')).toBeInTheDocument()
  })

  it('renders a real search input with the commands placeholder', () => {
    render(<TopBar {...baseProps} />)
    const input = screen.getByPlaceholderText('Type a command…')
    expect(input).toBeInstanceOf(HTMLInputElement)
    expect(input).toHaveAttribute('type', 'search')
  })

  it('shows the Ctrl+Shift+P hint on non-Mac platforms', () => {
    render(<TopBar {...baseProps} />)
    expect(screen.getByText('Ctrl+Shift+P')).toBeInTheDocument()
  })

  it('typing @ flips the placeholder to the files prompt', () => {
    render(<TopBar {...baseProps} />)
    const input = screen.getByPlaceholderText('Type a command…') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '@' } })
    expect(screen.getByPlaceholderText('Open a document…')).toBeInTheDocument()
  })

  it('opens the dropdown on focus and shows command results', () => {
    render(<TopBar {...baseProps} />)
    const input = screen.getByPlaceholderText('Type a command…')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'toggle' } })
    expect(screen.getByText('View: Toggle Sidebar')).toBeInTheDocument()
    expect(screen.getByText('View: Toggle Bottom Panel')).toBeInTheDocument()
  })

  it('keeps the dropdown closed when focus arrives without intent (e.g. incidental focus on mount)', () => {
    render(<TopBar {...baseProps} />)
    const input = screen.getByPlaceholderText('Type a command…')
    // Simulate something else focusing the input (no typing, no shortcut event)
    fireEvent.focus(input)
    expect(screen.queryByRole('listbox', { name: /command palette/i })).not.toBeInTheDocument()
    // …and confirms it stays closed when focus is stolen by another element
    fireEvent.blur(input)
    expect(screen.queryByRole('listbox', { name: /command palette/i })).not.toBeInTheDocument()
  })

  it('opens the dropdown when the user clicks the input (mousedown counts as intent)', () => {
    render(<TopBar {...baseProps} />)
    const input = screen.getByPlaceholderText('Type a command…')
    fireEvent.mouseDown(input)
    fireEvent.focus(input)
    expect(screen.getByRole('listbox', { name: /command palette/i })).toBeInTheDocument()
  })

  it('Enter activates the highlighted row and fires onRunCommand', () => {
    const onRunCommand = vi.fn()
    render(<TopBar {...baseProps} onRunCommand={onRunCommand} />)
    const input = screen.getByPlaceholderText('Type a command…')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'toggle bottom' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRunCommand).toHaveBeenCalledWith('view.toggleBottom')
  })

  it('Escape closes the dropdown', () => {
    render(<TopBar {...baseProps} />)
    const input = screen.getByPlaceholderText('Type a command…')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'toggle' } })
    expect(screen.getByText('View: Toggle Sidebar')).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByText('View: Toggle Sidebar')).not.toBeInTheDocument()
  })

  it('responds to canv:topbar:focus events by focusing the input', () => {
    render(<TopBar {...baseProps} />)
    const input = screen.getByPlaceholderText('Type a command…') as HTMLInputElement
    act(() => {
      window.dispatchEvent(new CustomEvent('canv:topbar:focus'))
    })
    expect(document.activeElement).toBe(input)
  })

  it('canv:topbar:focus with prefill="@" puts @ in the input and switches placeholder', () => {
    render(<TopBar {...baseProps} />)
    const input = screen.getByPlaceholderText('Type a command…') as HTMLInputElement
    act(() => {
      window.dispatchEvent(new CustomEvent('canv:topbar:focus', { detail: { prefill: '@' } }))
    })
    expect(input.value).toBe('@')
    expect(screen.getByPlaceholderText('Open a document…')).toBeInTheDocument()
  })

  it('layout-toggle bottom button highlights when placement is bottom', () => {
    render(<TopBar {...baseProps} bottomPlacement="bottom" bottomVisible={true} />)
    const btn = screen.getByRole('button', { name: /panel bottom/i })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
  })
})
