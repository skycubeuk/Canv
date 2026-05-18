import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Sparkles } from 'lucide-react'
import { TopBar } from './TopBar'
import type { Mode } from '../../config/types'

const stubProfile: Mode = {
  id: 'test',
  label: 'Test',
  systemPromptName: 'default',
  actions: [
    {
      id: 'doc-stub',
      label: 'Stub doc agent',
      group: 'core',
      inputMode: 'document',
      icon: Sparkles,
      prompt: 'stub',
    },
  ],
} as unknown as Mode

const baseProps = {
  workspaceName: 'UntitledBook',
  onOpenCommandPalette: vi.fn(),
  profile: stubProfile,
  hasMarkdownTab: false,
  activeFileName: null as string | null,
  onRunDocAgent: vi.fn(),
  bottomVisible: false,
  bottomPlacement: 'bottom' as const,
  onSetBottomPlacementBottom: vi.fn(),
  onSetBottomPlacementRight: vi.fn(),
}

describe('TopBar', () => {
  it('renders the Canv identity cluster with workspace name', () => {
    render(<TopBar {...baseProps} />)
    expect(screen.getByText('Canv')).toBeInTheDocument()
    expect(screen.getByText('UntitledBook')).toBeInTheDocument()
  })

  it('clicking the command-palette button fires onOpenCommandPalette', () => {
    const onOpen = vi.fn()
    render(<TopBar {...baseProps} onOpenCommandPalette={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: /find files/i }))
    expect(onOpen).toHaveBeenCalled()
  })

  it('Run-on-document button is disabled when no markdown tab is open', () => {
    render(<TopBar {...baseProps} hasMarkdownTab={false} />)
    const trigger = screen.getByTestId('document-agent-menu-trigger')
    expect(trigger).toBeDisabled()
  })

  it('Run-on-document button is enabled when a markdown tab is open', () => {
    render(<TopBar {...baseProps} hasMarkdownTab={true} />)
    const trigger = screen.getByTestId('document-agent-menu-trigger')
    expect(trigger).not.toBeDisabled()
  })

  it('layout-toggle bottom button highlights when placement is bottom', () => {
    render(<TopBar {...baseProps} bottomPlacement="bottom" bottomVisible={true} />)
    const btn = screen.getByRole('button', { name: /panel bottom/i })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
  })
})
