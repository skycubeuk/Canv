import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TopBar } from './TopBar'

const baseProps = {
  workspaceName: 'UntitledBook',
  activeSidebarTab: 'files' as const,
  onSelectSidebarTab: vi.fn(),
  onOpenCommandPalette: vi.fn(),
  onRunMain: vi.fn(),
  onOpenRunMenu: vi.fn(),
  sidebarVisible: true,
  bottomVisible: false,
  bottomPlacement: 'bottom' as const,
  onToggleSidebar: vi.fn(),
  onSetBottomPlacementBottom: vi.fn(),
  onSetBottomPlacementRight: vi.fn(),
  gitBadge: null as string | null,
}

describe('TopBar', () => {
  it('renders the Canv identity cluster with workspace name', () => {
    render(<TopBar {...baseProps} />)
    expect(screen.getByText('Canv')).toBeInTheDocument()
    expect(screen.getByText('UntitledBook')).toBeInTheDocument()
  })

  it('renders Files / Search / Git tabs and highlights the active one', () => {
    render(<TopBar {...baseProps} activeSidebarTab="search" />)
    const search = screen.getByRole('button', { name: /^search$/i })
    expect(search).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking a section tab fires onSelectSidebarTab', () => {
    const onSelectSidebarTab = vi.fn()
    render(<TopBar {...baseProps} onSelectSidebarTab={onSelectSidebarTab} />)
    fireEvent.click(screen.getByRole('button', { name: /^git$/i }))
    expect(onSelectSidebarTab).toHaveBeenCalledWith('git')
  })

  it('clicking the command-palette button fires onOpenCommandPalette', () => {
    const onOpen = vi.fn()
    render(<TopBar {...baseProps} onOpenCommandPalette={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: /find files/i }))
    expect(onOpen).toHaveBeenCalled()
  })

  it('clicking Run fires onRunMain', () => {
    const onRunMain = vi.fn()
    render(<TopBar {...baseProps} onRunMain={onRunMain} />)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(onRunMain).toHaveBeenCalled()
  })

  it('clicking the Run chevron fires onOpenRunMenu', () => {
    const onOpenRunMenu = vi.fn()
    render(<TopBar {...baseProps} onOpenRunMenu={onOpenRunMenu} />)
    fireEvent.click(screen.getByRole('button', { name: /run options/i }))
    expect(onOpenRunMenu).toHaveBeenCalled()
  })

  it('shows git badge count when provided', () => {
    render(<TopBar {...baseProps} gitBadge="3" />)
    const git = screen.getByRole('button', { name: /^git/i })
    expect(git).toHaveTextContent('3')
  })

  it('layout-toggle bottom button highlights when placement is bottom', () => {
    render(<TopBar {...baseProps} bottomPlacement="bottom" bottomVisible={true} />)
    const btn = screen.getByRole('button', { name: /panel bottom/i })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
  })
})
