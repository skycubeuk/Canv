import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SuggestionBar } from './SuggestionBar'

describe('SuggestionBar', () => {
  it('renders nothing when there are no pending changes', () => {
    const { container } = render(
      <SuggestionBar count={0} onAcceptAll={() => {}} onRejectAll={() => {}} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows the count and fires the callbacks', () => {
    const onAcceptAll = vi.fn()
    const onRejectAll = vi.fn()
    render(<SuggestionBar count={3} onAcceptAll={onAcceptAll} onRejectAll={onRejectAll} />)
    expect(screen.getByText(/3 changes/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /accept all/i }))
    fireEvent.click(screen.getByRole('button', { name: /reject all/i }))
    expect(onAcceptAll).toHaveBeenCalledOnce()
    expect(onRejectAll).toHaveBeenCalledOnce()
  })

  it('uses the singular noun for one change', () => {
    render(<SuggestionBar count={1} onAcceptAll={() => {}} onRejectAll={() => {}} />)
    expect(screen.getByText(/1 change\b/i)).toBeInTheDocument()
  })
})
