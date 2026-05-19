import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Newspaper } from 'lucide-react'
import { StatusBar } from './StatusBar'
import { makeTestMode, renderWithServices } from '../../test/fixtures'
import type { ICanvServices } from '../../services'

function makeProfile() {
  return makeTestMode({ id: 'factual', label: 'Factual', icon: Newspaper })
}

interface BuildOptions {
  apiKeyMissing?: boolean
  meterTokens?: number
  meterCostUsd?: number
  chatVisible?: boolean
  onClickApiKeyWarning?: () => void
  onClickProfile?: () => void
  onOpenSettings?: () => void
  onToggleChat?: () => void
}

function buildServices(opts: BuildOptions = {}): Partial<ICanvServices> {
  const profile = makeProfile()
  return {
    workspace: {
      conflict: false,
      writingSet: new Set(),
      dirtySet: new Set(),
      root: null,
      kind: null,
      openSettingsTab: opts.onClickApiKeyWarning ?? opts.onOpenSettings ?? vi.fn(),
    } as unknown as ICanvServices['workspace'],
    modes: {
      modes: [profile],
      defaultModeId: profile.id,
      profile: profile.id,
      setProfile: vi.fn(),
    } as unknown as ICanvServices['modes'],
    chatSessions: {
      apiKeyMissing: opts.apiKeyMissing ?? false,
      meterTotals: {
        tokens: opts.meterTokens ?? 0,
        costUsd: opts.meterCostUsd ?? 0,
      },
    } as unknown as ICanvServices['chatSessions'],
    editorStats: {
      wordCount: 0,
      selectionWordCount: null,
    } as unknown as ICanvServices['editorStats'],
    ideLayout: {
      layout: { bottom: { visible: opts.chatVisible ?? false, activeTab: opts.chatVisible ? 'chat' : null } },
      toggleBottom: opts.onToggleChat ?? vi.fn(),
      showBottomTab: vi.fn(),
    } as unknown as ICanvServices['ideLayout'],
    profilePicker: {
      openSwitcher: opts.onClickProfile ?? vi.fn(),
    } as unknown as ICanvServices['profilePicker'],
    contributions: {
      statusBarItems: [],
    } as unknown as ICanvServices['contributions'],
  }
}

describe('StatusBar', () => {
  it('does not render the API-key warning when apiKeyMissing is false', () => {
    renderWithServices(<StatusBar />, buildServices())
    expect(screen.queryByRole('button', { name: /no api key/i })).toBeNull()
  })

  it('renders the API-key warning at the left when apiKeyMissing is true', () => {
    renderWithServices(<StatusBar />, buildServices({ apiKeyMissing: true }))
    expect(screen.getByRole('button', { name: /no api key/i })).toBeInTheDocument()
  })

  it('clicking the warning opens Settings', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    renderWithServices(<StatusBar />, buildServices({ apiKeyMissing: true, onClickApiKeyWarning: onClick }))
    await user.click(screen.getByRole('button', { name: /no api key/i }))
    expect(onClick).toHaveBeenCalled()
  })

  it('does not render a provider · model button anywhere', () => {
    renderWithServices(<StatusBar />, buildServices())
    expect(screen.queryByText(/anthropic|openai/i)).toBeNull()
  })

  it('renders the profile button as plain text without an SVG icon', () => {
    renderWithServices(<StatusBar />, buildServices())
    const button = screen.getByRole('button', { name: /factual/i })
    expect(button.querySelector('svg')).toBeNull()
    expect(button.textContent).toMatch(/factual/i)
  })

  it('renders the chat-toggle button as pressed when chat is visible', () => {
    renderWithServices(<StatusBar />, buildServices({ chatVisible: true }))
    const btn = screen.getByRole('button', { name: /hide chat/i })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders the run meter when both meterTokens and meterCostUsd are non-null', () => {
    renderWithServices(<StatusBar />, buildServices({ meterTokens: 1247, meterCostUsd: 0.18 }))
    expect(screen.getByText('1,247 tok · $0.18')).toBeInTheDocument()
  })

  it('renders an Open Settings button that calls openSettingsTab when clicked', async () => {
    const onOpen = vi.fn()
    const user = userEvent.setup()
    renderWithServices(<StatusBar />, buildServices({ onOpenSettings: onOpen }))
    await user.click(screen.getByRole('button', { name: /open settings/i }))
    expect(onOpen).toHaveBeenCalled()
  })
})
