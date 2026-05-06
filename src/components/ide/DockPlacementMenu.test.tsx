import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DockPlacementMenu } from './DockPlacementMenu'

describe('DockPlacementMenu', () => {
  it('renders three placement buttons when popout is enabled', () => {
    render(
      <DockPlacementMenu placement="bottom" canPopOut onChange={vi.fn()} />,
    )
    expect(screen.getByLabelText(/dock at bottom/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/dock at right/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/pop out dock/i)).toBeInTheDocument()
  })

  it('hides the pop-out button when canPopOut is false', () => {
    render(
      <DockPlacementMenu placement="bottom" canPopOut={false} onChange={vi.fn()} />,
    )
    expect(screen.queryByLabelText(/pop out dock/i)).toBeNull()
  })

  it('marks the active placement with aria-pressed=true', () => {
    render(
      <DockPlacementMenu placement="right" canPopOut onChange={vi.fn()} />,
    )
    expect(screen.getByLabelText(/dock at right/i)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText(/dock at bottom/i)).toHaveAttribute('aria-pressed', 'false')
  })

  it('calls onChange with the matching placement on click', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(
      <DockPlacementMenu placement="bottom" canPopOut onChange={onChange} />,
    )
    await user.click(screen.getByLabelText(/dock at right/i))
    expect(onChange).toHaveBeenCalledWith('right')
    await user.click(screen.getByLabelText(/pop out dock/i))
    expect(onChange).toHaveBeenCalledWith('popout')
  })
})
