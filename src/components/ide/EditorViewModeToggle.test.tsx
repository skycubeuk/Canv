import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorViewModeToggle } from './EditorViewModeToggle'

describe('EditorViewModeToggle', () => {
  it('renders Edit and Preview buttons', () => {
    render(<EditorViewModeToggle mode="edit" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^preview$/i })).toBeInTheDocument()
  })

  it('marks the current mode as pressed', () => {
    render(<EditorViewModeToggle mode="preview" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /^edit$/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /^preview$/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls onChange with the clicked mode', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<EditorViewModeToggle mode="edit" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /^preview$/i }))
    expect(onChange).toHaveBeenCalledWith('preview')
  })

  it('does not call onChange when clicking the already-active button', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<EditorViewModeToggle mode="edit" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: /^edit$/i }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
