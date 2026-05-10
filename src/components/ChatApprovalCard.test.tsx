import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatApprovalCard } from './ChatApprovalCard'

describe('ChatApprovalCard', () => {
  it('renders create with content preview', () => {
    render(<ChatApprovalCard
      preview={{ kind: 'create', path: 'notes/hi.md', size: 4, contentPreview: 'line1\nline2' }}
      state="pending"
      onDecide={() => {}}
    />)
    expect(screen.getByText(/Create notes\/hi\.md/i)).toBeInTheDocument()
    expect(screen.getByText(/line1/)).toBeInTheDocument()
  })

  it('renders edit with diff before/after', () => {
    render(<ChatApprovalCard
      preview={{ kind: 'edit', path: 'a.md', diff: { before: 'old', after: 'new' } }}
      state="pending"
      onDecide={() => {}}
    />)
    expect(screen.getByText(/Edit a\.md/i)).toBeInTheDocument()
    expect(screen.getByText(/old/)).toBeInTheDocument()
    expect(screen.getByText(/new/)).toBeInTheDocument()
  })

  it('calls onDecide with the chosen decision', () => {
    const onDecide = vi.fn()
    render(<ChatApprovalCard
      preview={{ kind: 'delete', path: 'old.md' }}
      state="pending"
      onDecide={onDecide}
    />)
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }))
    expect(onDecide).toHaveBeenCalledWith('approve')
    fireEvent.click(screen.getByRole('button', { name: /deny/i }))
    expect(onDecide).toHaveBeenCalledWith('deny')
    fireEvent.click(screen.getByRole('button', { name: /approve rest/i }))
    expect(onDecide).toHaveBeenCalledWith('approve-rest')
  })

  it('hides buttons and shows status when resolved', () => {
    render(<ChatApprovalCard
      preview={{ kind: 'mkdir', path: 'notes' }}
      state="approved"
      onDecide={() => {}}
    />)
    expect(screen.queryByRole('button', { name: /approve$/i })).toBeNull()
    expect(screen.getByText(/approved/i)).toBeInTheDocument()
  })
})
