import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DocumentAgentInstructionModal } from './DocumentAgentInstructionModal'
import { makeTestAction } from '../test/fixtures'

const refine = makeTestAction({
  id: 'refine',
  label: 'Refine',
  inputMode: 'selection',
  outputMode: 'replacement',
  needsInstruction: true,
  instructionPlaceholder: 'What should change?',
  prompt: '{{instruction}}\n{{text}}',
})

describe('DocumentAgentInstructionModal', () => {
  it('renders the agent label and an autoFocused input', () => {
    render(
      <DocumentAgentInstructionModal
        agent={refine}
        canRun={true}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/refine/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  it('submits the trimmed value on Enter', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <DocumentAgentInstructionModal
        agent={refine}
        canRun={true}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )
    await user.type(screen.getByRole('textbox'), '  shorter sentences  ')
    await user.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('shorter sentences')
  })

  it('cancels on Escape', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <DocumentAgentInstructionModal
        agent={refine}
        canRun={true}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    )
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalled()
  })

  it('cancels on backdrop click', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <DocumentAgentInstructionModal
        agent={refine}
        canRun={true}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    )
    await user.click(screen.getByTestId('agent-modal-backdrop'))
    expect(onCancel).toHaveBeenCalled()
  })

  it('disables Run when input is whitespace-only', () => {
    render(
      <DocumentAgentInstructionModal
        agent={refine}
        canRun={true}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /^run$/i })).toBeDisabled()
  })

  it('disables Run when canRun=false even with non-empty input', async () => {
    const user = userEvent.setup()
    render(
      <DocumentAgentInstructionModal
        agent={refine}
        canRun={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    await user.type(screen.getByRole('textbox'), 'hello')
    expect(screen.getByRole('button', { name: /^run$/i })).toBeDisabled()
  })
})
