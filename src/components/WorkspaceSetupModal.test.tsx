import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WorkspaceSetupModal } from './WorkspaceSetupModal'

const modes = [
  { id: 'fiction', label: 'Fiction' },
  { id: 'factual', label: 'Factual' },
  { id: 'technical', label: 'Technical' },
]

describe('WorkspaceSetupModal', () => {
  it('renders profile options from props and defaults to provided defaultProfile', () => {
    render(<WorkspaceSetupModal modes={modes} defaultProfile="factual"
      onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect((screen.getByLabelText('Factual') as HTMLInputElement).checked).toBe(true)
  })

  it('calls onConfirm with selected values', () => {
    const onConfirm = vi.fn()
    render(<WorkspaceSetupModal modes={modes} defaultProfile="fiction"
      onConfirm={onConfirm} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Technical'))
    fireEvent.click(screen.getByRole('button', { name: /Set up workspace/i }))
    expect(onConfirm).toHaveBeenCalledWith({ defaultProfile: 'technical', enableRA: true })
  })

  it('calls onCancel when Cancel clicked', () => {
    const onCancel = vi.fn()
    render(<WorkspaceSetupModal modes={modes} defaultProfile="fiction"
      onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
