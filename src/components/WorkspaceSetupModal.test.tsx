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
    render(<WorkspaceSetupModal modes={modes} defaultProfile="factual" remote={false}
      onConfirm={vi.fn()} onCancel={vi.fn()} />)
    expect((screen.getByLabelText('Factual') as HTMLInputElement).checked).toBe(true)
  })

  it('disables RA checkbox on remote and shows a note', () => {
    render(<WorkspaceSetupModal modes={modes} defaultProfile="fiction" remote={true}
      onConfirm={vi.fn()} onCancel={vi.fn()} />)
    const ra = screen.getByLabelText(/Revision Archaeology/i) as HTMLInputElement
    expect(ra.disabled).toBe(true)
    expect(ra.checked).toBe(false)
    expect(screen.getByText(/Remote workspaces are not yet supported/i)).toBeInTheDocument()
  })

  it('calls onConfirm with selected values', () => {
    const onConfirm = vi.fn()
    render(<WorkspaceSetupModal modes={modes} defaultProfile="fiction" remote={false}
      onConfirm={onConfirm} onCancel={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Technical'))
    fireEvent.click(screen.getByLabelText(/Revision Archaeology/i))
    // Default RA state (non-remote) is checked, so the click above unchecks it.
    // Re-check it for an explicit "enabled" outcome:
    fireEvent.click(screen.getByLabelText(/Revision Archaeology/i))
    fireEvent.click(screen.getByRole('button', { name: /Set up workspace/i }))
    expect(onConfirm).toHaveBeenCalledWith({ defaultProfile: 'technical', enableRA: true })
  })

  it('calls onCancel when Cancel clicked', () => {
    const onCancel = vi.fn()
    render(<WorkspaceSetupModal modes={modes} defaultProfile="fiction" remote={false}
      onConfirm={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
