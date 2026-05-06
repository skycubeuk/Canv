import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileText, Library, PencilLine, Type } from 'lucide-react'
import { DocumentAgentMenu } from './DocumentAgentMenu'
import { makeTestMode, makeTestAction } from '../test/fixtures'
import type { Action } from '../config/types'

const docA = makeTestAction({ id: 'doc-a', label: 'Document A', icon: FileText, inputMode: 'document', outputMode: 'replacement' })
const docB = makeTestAction({ id: 'doc-b', label: 'Document B', icon: Library, inputMode: 'selection-or-document', outputMode: 'replacement' })
const docInstr = makeTestAction({ id: 'doc-instr', label: 'Doc With Instruction', icon: PencilLine, inputMode: 'document', outputMode: 'replacement', needsInstruction: true, instructionPlaceholder: 'How?', prompt: '{{instruction}}\n{{text}}' })
const selOnly = makeTestAction({ id: 'sel-only', label: 'Selection Only', icon: Type, inputMode: 'selection', outputMode: 'replacement' })

function makeProfile(actions: Action[]) {
  return makeTestMode({ actions })
}

describe('DocumentAgentMenu', () => {
  it('hides the trigger when zero document-agents are enabled', () => {
    render(
      <DocumentAgentMenu
        profile={makeProfile([selOnly])}
        hasMarkdownTab={true}
        onRunAgent={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /run on document/i })).toBeNull()
  })

  it('disables the trigger when no markdown tab is active', () => {
    render(
      <DocumentAgentMenu
        profile={makeProfile([docA])}
        hasMarkdownTab={false}
        onRunAgent={vi.fn()}
      />,
    )
    const btn = screen.getByRole('button', { name: /run on document/i })
    expect(btn).toBeDisabled()
  })

  it('opens the popover with document-agents in actions order', async () => {
    const user = userEvent.setup()
    render(
      <DocumentAgentMenu
        profile={makeProfile([docB, docA])}
        hasMarkdownTab={true}
        onRunAgent={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /run on document/i }))
    const menu = screen.getByRole('menu')
    const items = within(menu).getAllByRole('menuitem')
    expect(items.map((el) => el.textContent)).toEqual([
      expect.stringContaining('Document B'),
      expect.stringContaining('Document A'),
    ])
  })

  it('runs a no-instruction agent and closes the popover', async () => {
    const onRunAgent = vi.fn()
    const user = userEvent.setup()
    render(
      <DocumentAgentMenu
        profile={makeProfile([docA])}
        hasMarkdownTab={true}
        onRunAgent={onRunAgent}
      />,
    )
    await user.click(screen.getByRole('button', { name: /run on document/i }))
    await user.click(screen.getByRole('menuitem', { name: /document a/i }))
    expect(onRunAgent).toHaveBeenCalledWith(expect.objectContaining({ id: 'doc-a' }), undefined)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('transitions to instruction view for needsInstruction agents and submits the trimmed value', async () => {
    const onRunAgent = vi.fn()
    const user = userEvent.setup()
    render(
      <DocumentAgentMenu
        profile={makeProfile([docInstr])}
        hasMarkdownTab={true}
        onRunAgent={onRunAgent}
      />,
    )
    await user.click(screen.getByRole('button', { name: /run on document/i }))
    await user.click(screen.getByRole('menuitem', { name: /doc with instruction/i }))
    const input = screen.getByRole('textbox')
    await user.type(input, '  tighten prose  ')
    await user.click(screen.getByRole('button', { name: /^run$/i }))
    expect(onRunAgent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'doc-instr' }),
      'tighten prose',
    )
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('Esc from instruction view returns to the agent list (does not close)', async () => {
    const user = userEvent.setup()
    render(
      <DocumentAgentMenu
        profile={makeProfile([docInstr])}
        hasMarkdownTab={true}
        onRunAgent={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /run on document/i }))
    await user.click(screen.getByRole('menuitem', { name: /doc with instruction/i }))
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('menuitem', { name: /doc with instruction/i })).toBeInTheDocument()
  })

  it('Esc from the list closes the popover', async () => {
    const user = userEvent.setup()
    render(
      <DocumentAgentMenu
        profile={makeProfile([docA])}
        hasMarkdownTab={true}
        onRunAgent={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: /run on document/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('outside-click closes the popover', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <button>outside</button>
        <DocumentAgentMenu
          profile={makeProfile([docA])}
          hasMarkdownTab={true}
          onRunAgent={vi.fn()}
        />
      </div>,
    )
    await user.click(screen.getByRole('button', { name: /run on document/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'outside' }))
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
