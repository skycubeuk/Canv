import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Newspaper } from 'lucide-react'
import { StatusBar } from './StatusBar'
import { makeTestMode } from '../../test/fixtures'

function makeProfile() {
  return makeTestMode({ id: 'factual', label: 'Factual', icon: Newspaper })
}

const baseProps = {
  saveState: 'saved' as const,
  profile: makeProfile(),
  workspaceName: null as string | null,
  kind: null as Parameters<typeof StatusBar>[0]['kind'],
  wordCount: 0,
  selectionWordCount: null as number | null,
  onClickProfile: vi.fn(),
  apiKeyMissing: false,
  onClickApiKeyWarning: vi.fn(),
  cursorLine: null as number | null,
  cursorCol: null as number | null,
  branch: null as string | null,
  diffStats: null as { added: number; removed: number } | null,
  chatVisible: false,
  onToggleChat: vi.fn(),
  onOpenSettings: vi.fn(),
  meterTokens: null as number | null,
  meterCostUsd: null as number | null,
}

describe('StatusBar', () => {
  it('does not render the API-key warning when apiKeyMissing is false', () => {
    render(<StatusBar {...baseProps} />)
    expect(screen.queryByRole('button', { name: /no api key/i })).toBeNull()
  })

  it('renders the API-key warning at the left when apiKeyMissing is true', () => {
    render(<StatusBar {...baseProps} apiKeyMissing={true} />)
    expect(screen.getByRole('button', { name: /no api key/i })).toBeInTheDocument()
  })

  it('clicking the warning calls onClickApiKeyWarning', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<StatusBar {...baseProps} apiKeyMissing={true} onClickApiKeyWarning={onClick} />)
    await user.click(screen.getByRole('button', { name: /no api key/i }))
    expect(onClick).toHaveBeenCalled()
  })

  it('does not render a provider · model button anywhere', () => {
    render(<StatusBar {...baseProps} />)
    expect(screen.queryByText(/anthropic|openai/i)).toBeNull()
  })

  it('renders the profile button as plain text without an SVG icon', () => {
    render(<StatusBar {...baseProps} />)
    const button = screen.getByRole('button', { name: /factual/i })
    expect(button.querySelector('svg')).toBeNull()
    expect(button.textContent).toMatch(/factual/i)
  })

  it('renders the chat-toggle button as pressed when chat is visible', () => {
    render(<StatusBar {...baseProps} chatVisible={true} />)
    const btn = screen.getByRole('button', { name: /hide chat/i })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders cursor line/col when both are non-null', () => {
    render(<StatusBar {...baseProps} cursorLine={24} cursorCol={18} />)
    expect(screen.getByText('Ln 24, Col 18')).toBeInTheDocument()
  })

  it('omits cursor line/col when cursorLine is null', () => {
    render(<StatusBar {...baseProps} cursorLine={null} cursorCol={null} />)
    expect(screen.queryByText(/Ln \d+, Col \d+/)).not.toBeInTheDocument()
  })

  it('renders the run meter when both meterTokens and meterCostUsd are non-null', () => {
    render(<StatusBar {...baseProps} meterTokens={1247} meterCostUsd={0.18} />)
    expect(screen.getByText('1,247 tok · $0.18')).toBeInTheDocument()
  })

  it('renders an Open Settings button that calls onOpenSettings when clicked', async () => {
    const onOpen = vi.fn()
    const user = userEvent.setup()
    render(<StatusBar {...baseProps} onOpenSettings={onOpen} />)
    await user.click(screen.getByRole('button', { name: /open settings/i }))
    expect(onOpen).toHaveBeenCalled()
  })
})
