import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SidebarFooter } from './SidebarFooter'
import type { Settings } from '../../../hooks/useSettings'

function makeSettings(): Settings {
  return {
    provider: 'anthropic',
    apiKeys: { anthropic: '', openai: '' },
    defaultModel: { anthropic: 'claude-sonnet-4-6', openai: 'gpt-4o' },
    perAgentModel: {},
    theme: 'system',
    fontSize: 16,
    lineWidth: 'normal',
  } as Settings
}

describe('SidebarFooter', () => {
  it('renders the current model label, Chat, and Settings buttons', () => {
    render(
      <SidebarFooter
        settings={makeSettings()}
        onUpdateSettings={vi.fn()}
        chatOpen={false}
        onToggleChat={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /claude-sonnet-4-6/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /chat/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument()
  })

  it('calls onToggleChat when the Chat button is clicked', async () => {
    const onToggleChat = vi.fn()
    const user = userEvent.setup()
    render(
      <SidebarFooter
        settings={makeSettings()}
        onUpdateSettings={vi.fn()}
        chatOpen={false}
        onToggleChat={onToggleChat}
        onOpenSettings={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /chat/i }))
    expect(onToggleChat).toHaveBeenCalled()
  })

  it('calls onOpenSettings when the Settings button is clicked', async () => {
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()
    render(
      <SidebarFooter
        settings={makeSettings()}
        onUpdateSettings={vi.fn()}
        chatOpen={false}
        onToggleChat={vi.fn()}
        onOpenSettings={onOpenSettings}
      />,
    )
    await user.click(screen.getByRole('button', { name: /settings/i }))
    expect(onOpenSettings).toHaveBeenCalled()
  })

  it('reflects chatOpen with an aria-pressed=true state on the Chat button', () => {
    const { rerender } = render(
      <SidebarFooter
        settings={makeSettings()}
        onUpdateSettings={vi.fn()}
        chatOpen={false}
        onToggleChat={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /chat/i })).toHaveAttribute('aria-pressed', 'false')
    rerender(
      <SidebarFooter
        settings={makeSettings()}
        onUpdateSettings={vi.fn()}
        chatOpen={true}
        onToggleChat={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /chat/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens the model dropdown and lets the user pick a different model', async () => {
    const onUpdateSettings = vi.fn()
    const user = userEvent.setup()
    render(
      <SidebarFooter
        settings={makeSettings()}
        onUpdateSettings={onUpdateSettings}
        chatOpen={false}
        onToggleChat={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /claude-sonnet-4-6/i }))
    const modelSelect = screen.getByLabelText(/^model$/i) as HTMLSelectElement
    await user.selectOptions(modelSelect, modelSelect.options[1].value)
    expect(onUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultModel: expect.objectContaining({
          anthropic: modelSelect.options[1].value,
        }),
      }),
    )
  })

  it('closes the model dropdown on Escape', async () => {
    const user = userEvent.setup()
    render(
      <SidebarFooter
        settings={makeSettings()}
        onUpdateSettings={vi.fn()}
        chatOpen={false}
        onToggleChat={vi.fn()}
        onOpenSettings={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /claude-sonnet-4-6/i }))
    expect(screen.getByLabelText(/^model$/i)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByLabelText(/^model$/i)).toBeNull()
  })

  it('closes the model dropdown on outside click', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <button>outside</button>
        <SidebarFooter
          settings={makeSettings()}
          onUpdateSettings={vi.fn()}
          chatOpen={false}
          onToggleChat={vi.fn()}
          onOpenSettings={vi.fn()}
        />
      </div>,
    )
    await user.click(screen.getByRole('button', { name: /claude-sonnet-4-6/i }))
    expect(screen.getByLabelText(/^model$/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByLabelText(/^model$/i)).toBeNull()
  })
})
