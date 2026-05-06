import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RunView, type RunRecord } from './ResultsPanel'
import { ContextMenuProvider } from '../lib/contextMenu'
import { makeTestMode, makeTestAction } from '../test/fixtures'
import { PencilLine, BookOpen, Brain, FileText } from 'lucide-react'

// Build a mode with all action IDs used in these tests.
const testMode = makeTestMode({
  id: 'test',
  actions: [
    makeTestAction({ id: 'grammar',   label: 'Grammar & Spelling', icon: PencilLine, outputMode: 'feedback-and-rewrite' }),
    makeTestAction({ id: 'story',     label: 'Story Reviewer',     icon: BookOpen,   outputMode: 'feedback-only'        }),
    makeTestAction({ id: 'logic',     label: 'Logic Checker',      icon: Brain,      outputMode: 'feedback-only'        }),
    makeTestAction({ id: 'summarise', label: 'Summarise',          icon: FileText,   outputMode: 'feedback-only'        }),
  ],
})

// Provide a synchronous modes context — no async loading needed in unit tests.
vi.mock('../hooks/useModes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useModes')>()
  return {
    ...actual,
    useModes: () => ({ modes: [testMode], defaultModeId: 'test' }),
  }
})

function baseRun(overrides: Partial<RunRecord>): RunRecord {
  return {
    id: 'run-1',
    agentId: 'grammar',
    agentLabel: 'Grammar & Spelling',
    modeId: 'test',
    model: 'gpt-4',
    provider: 'openai',
    sourceText: 'The original document body.',
    range: { from: 0, to: 27 },
    response: 'ISSUES:\n- none\n\nCORRECTED:\nThe original document body.',
    status: 'done',
    timestamp: Date.now(),
    basePrompt: 'p',
    originalResponse: 'ISSUES:\n- none\n\nCORRECTED:\nThe original document body.',
    schemaVersion: 2,
    ...overrides,
  }
}

describe('RunView', () => {
  it('whole-document grammar run (range null) shows an enabled Apply button', () => {
    const run = baseRun({
      range: null,
      response: 'ISSUES:\n- a typo\n\nCORRECTED:\nThe corrected document.',
      sourceText: 'The original document.',
    })
    render(
      <ContextMenuProvider><RunView run={run} onApply={vi.fn()} onRerun={vi.fn()} onRefine={vi.fn()} /></ContextMenuProvider>,
    )
    const apply = screen.getByRole('button', { name: /apply/i })
    expect(apply).toBeEnabled()
  })

  it('whole-document grammar run (range null) renders the diff toggle', () => {
    const run = baseRun({
      range: null,
      response: 'ISSUES:\n- a typo\n\nCORRECTED:\nThe corrected document.',
      sourceText: 'The original document.',
    })
    render(
      <ContextMenuProvider><RunView run={run} onApply={vi.fn()} onRerun={vi.fn()} onRefine={vi.fn()} /></ContextMenuProvider>,
    )
    expect(screen.getByText(/show diff/i)).toBeInTheDocument()
  })

  it('feedback-only agent renders no Apply button and no diff', () => {
    const run = baseRun({
      agentId: 'story',
      agentLabel: 'Story Reviewer',
      response: 'NOTES:\n- the opening drags',
      originalResponse: 'NOTES:\n- the opening drags',
    })
    render(
      <ContextMenuProvider><RunView run={run} onApply={vi.fn()} onRerun={vi.fn()} onRefine={vi.fn()} /></ContextMenuProvider>,
    )
    expect(screen.queryByRole('button', { name: /^apply$/i })).toBeNull()
    expect(screen.queryByText(/show diff/i)).toBeNull()
  })

  it('feedback-only agent still shows the refine textarea', () => {
    const run = baseRun({
      agentId: 'logic',
      agentLabel: 'Logic Checker',
      response: 'NOTES:\n- contradiction in paragraph 2',
      originalResponse: 'NOTES:\n- contradiction in paragraph 2',
    })
    render(
      <ContextMenuProvider><RunView run={run} onApply={vi.fn()} onRerun={vi.fn()} onRefine={vi.fn()} /></ContextMenuProvider>,
    )
    expect(screen.getByPlaceholderText(/discuss or refine/i)).toBeInTheDocument()
  })

  it('feedback-only summarise agent uses "Summary" as the section heading', () => {
    const run = baseRun({
      agentId: 'summarise',
      agentLabel: 'Summarise',
      response: 'A two-sentence summary.',
      originalResponse: 'A two-sentence summary.',
    })
    render(
      <ContextMenuProvider><RunView run={run} onApply={vi.fn()} onRerun={vi.fn()} onRefine={vi.fn()} /></ContextMenuProvider>,
    )
    expect(screen.getByText(/^summary$/i)).toBeInTheDocument()
    expect(screen.queryByText(/^notes$/i)).toBeNull()
  })

  it('feedback-only renders a Copy button so the user can grab the text', () => {
    const run = baseRun({
      agentId: 'story',
      agentLabel: 'Story Reviewer',
      response: 'NOTES:\n- pacing is uneven',
      originalResponse: 'NOTES:\n- pacing is uneven',
    })
    render(
      <ContextMenuProvider><RunView run={run} onApply={vi.fn()} onRerun={vi.fn()} onRefine={vi.fn()} /></ContextMenuProvider>,
    )
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
  })
})
