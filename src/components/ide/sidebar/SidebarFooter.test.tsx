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
  it('renders the workspace name and current model', () => {
    render(
      <SidebarFooter
        settings={makeSettings()}
        onUpdateSettings={vi.fn()}
        workspaceName="/home/user/my-project"
      />,
    )
    expect(screen.getByText('my-project')).toBeInTheDocument()
    expect(screen.getByText('claude-sonnet-4-6')).toBeInTheDocument()
  })

  it('renders "No workspace" when workspaceName is null', () => {
    render(
      <SidebarFooter
        settings={makeSettings()}
        onUpdateSettings={vi.fn()}
        workspaceName={null}
      />,
    )
    expect(screen.getByText('No workspace')).toBeInTheDocument()
  })

  it('shows the workspace initial avatar', () => {
    render(
      <SidebarFooter
        settings={makeSettings()}
        onUpdateSettings={vi.fn()}
        workspaceName="/home/user/my-project"
      />,
    )
    expect(screen.getByText('M')).toBeInTheDocument()
  })

  it('opens the provider/model popover on click', async () => {
    const user = userEvent.setup()
    render(
      <SidebarFooter
        settings={makeSettings()}
        onUpdateSettings={vi.fn()}
        workspaceName="/home/user/my-project"
      />,
    )
    expect(screen.queryByLabelText(/^model$/i)).toBeNull()
    await user.click(screen.getByTitle('Workspace and model'))
    expect(screen.getByLabelText(/^model$/i)).toBeInTheDocument()
  })

  it('closes the popover on Escape', async () => {
    const user = userEvent.setup()
    render(
      <SidebarFooter
        settings={makeSettings()}
        onUpdateSettings={vi.fn()}
        workspaceName="/home/user/my-project"
      />,
    )
    await user.click(screen.getByTitle('Workspace and model'))
    expect(screen.getByLabelText(/^model$/i)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByLabelText(/^model$/i)).toBeNull()
  })

  it('closes the popover on outside click', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <button>outside</button>
        <SidebarFooter
          settings={makeSettings()}
          onUpdateSettings={vi.fn()}
          workspaceName="/home/user/my-project"
        />
      </div>,
    )
    await user.click(screen.getByTitle('Workspace and model'))
    expect(screen.getByLabelText(/^model$/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByLabelText(/^model$/i)).toBeNull()
  })

  it('calls onUpdateSettings with new model when user picks from dropdown', async () => {
    const onUpdateSettings = vi.fn()
    const user = userEvent.setup()
    render(
      <SidebarFooter
        settings={makeSettings()}
        onUpdateSettings={onUpdateSettings}
        workspaceName="/home/user/my-project"
      />,
    )
    await user.click(screen.getByTitle('Workspace and model'))
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
})
