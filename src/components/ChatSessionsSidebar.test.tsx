import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatSessionsSidebar, type SidebarSession } from './ChatSessionsSidebar'

const sessions: SidebarSession[] = [
  { id: 's1', title: 'New chat', busy: false, pendingApprovalCount: 0 },
  { id: 's2', title: 'Summarise this doc', busy: true, pendingApprovalCount: 0 },
  { id: 's3', title: 'Refactor plan', busy: false, pendingApprovalCount: 2 },
]

describe('ChatSessionsSidebar', () => {
  it('renders one row per session and marks the active one', () => {
    render(
      <ChatSessionsSidebar
        sessions={sessions}
        activeId="s2"
        onCreate={() => {}}
        onSelect={() => {}}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('Summarise this doc').closest('[data-active="true"]')).not.toBeNull()
    expect(screen.getByText('Refactor plan').closest('[data-active="true"]')).toBeNull()
  })

  it('shows a spinner on busy sessions', () => {
    render(<ChatSessionsSidebar sessions={sessions} activeId="s1" onCreate={() => {}} onSelect={() => {}} onClose={() => {}} />)
    expect(screen.getByTestId('session-busy-s2')).toBeInTheDocument()
    expect(screen.queryByTestId('session-busy-s1')).toBeNull()
  })

  it('shows an approval badge with the count when pendingApprovalCount > 0', () => {
    render(<ChatSessionsSidebar sessions={sessions} activeId="s1" onCreate={() => {}} onSelect={() => {}} onClose={() => {}} />)
    const badge = screen.getByTestId('session-approvals-s3')
    expect(badge).toHaveTextContent('2')
  })

  it('clicking "+ New chat" calls onCreate', () => {
    const onCreate = vi.fn()
    render(<ChatSessionsSidebar sessions={sessions} activeId="s1" onCreate={onCreate} onSelect={() => {}} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    expect(onCreate).toHaveBeenCalled()
  })

  it('clicking a row calls onSelect with that id', () => {
    const onSelect = vi.fn()
    render(<ChatSessionsSidebar sessions={sessions} activeId="s1" onCreate={() => {}} onSelect={onSelect} onClose={() => {}} />)
    fireEvent.click(screen.getByText('Refactor plan'))
    expect(onSelect).toHaveBeenCalledWith('s3')
  })

  it('clicking the X calls onClose with that id', () => {
    const onClose = vi.fn()
    render(<ChatSessionsSidebar sessions={sessions} activeId="s1" onCreate={() => {}} onSelect={() => {}} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close Refactor plan'))
    expect(onClose).toHaveBeenCalledWith('s3')
  })
})
