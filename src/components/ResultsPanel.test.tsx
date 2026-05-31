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

  it('structured review JSON renders as a readable list, not raw JSON', () => {
    const json = JSON.stringify([
      { quote: 'the opening line', comment: 'This gripped me right away.' },
      { quote: 'a quiet ending', comment: 'I wanted a touch more here.' },
    ])
    const run = baseRun({
      agentId: 'story',
      agentLabel: 'Story Reviewer',
      response: json,
      originalResponse: json,
    })
    render(
      <ContextMenuProvider><RunView run={run} onApply={vi.fn()} onRerun={vi.fn()} onRefine={vi.fn()} /></ContextMenuProvider>,
    )
    // Friendly list: comments + quoted snippets are shown…
    expect(screen.getByText('This gripped me right away.')).toBeInTheDocument()
    expect(screen.getByText(/the opening line/)).toBeInTheDocument()
    expect(screen.getByText(/notes \(2\)/i)).toBeInTheDocument()
    // …and the raw JSON punctuation is NOT dumped into the panel.
    expect(screen.queryByText(/"comment"/)).toBeNull()
    expect(screen.queryByText(/\[\{/)).toBeNull()
  })

  it('while structured JSON is still streaming, shows a Reading state not raw JSON', () => {
    const partial = '[\n  {\n    "quote": "the opening line",\n    "comment": "This gri'
    const run = baseRun({
      agentId: 'story',
      agentLabel: 'Story Reviewer',
      status: 'streaming',
      response: partial,
      originalResponse: partial,
    })
    render(
      <ContextMenuProvider><RunView run={run} onApply={vi.fn()} onRerun={vi.fn()} onRefine={vi.fn()} /></ContextMenuProvider>,
    )
    expect(screen.getByText(/reading your text/i)).toBeInTheDocument()
    // The partial JSON keys must not be shown to the user.
    expect(screen.queryByText(/"quote"/)).toBeNull()
  })

  it('hides the diff preview when showDiffInPanel is false', () => {
    const run = baseRun({
      range: null,
      response: 'ISSUES:\n- a typo\n\nCORRECTED:\nThe corrected document.',
      sourceText: 'The original document.',
      showDiffInPanel: false,
    })
    render(
      <ContextMenuProvider><RunView run={run} onApply={vi.fn()} onRerun={vi.fn()} onRefine={vi.fn()} /></ContextMenuProvider>,
    )
    expect(screen.queryByText(/show diff/i)).toBeNull()
  })

  it('shows the diff preview when showDiffInPanel is undefined (legacy run)', () => {
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

  it('refinements render as plain panel-scale text, not chat bubbles', () => {
    const run = baseRun({
      followups: [
        { user: 'Make it softer', assistant: 'Here is a softer version.' },
      ],
    })
    render(
      <ContextMenuProvider>
        <RunView
          run={run}
          onApply={vi.fn()}
          onRerun={vi.fn()}
          onRefine={vi.fn()}
        />
      </ContextMenuProvider>,
    )

    expect(screen.getByText('Make it softer')).toBeInTheDocument()
    expect(screen.getByText('Here is a softer version.')).toBeInTheDocument()
    expect(screen.getByText('Refinements')).toBeInTheDocument()

    const hasTextSmAncestor = (el: HTMLElement | null): boolean => {
      while (el) {
        if (el.className && /\btext-sm\b/.test(el.className)) return true
        el = el.parentElement
      }
      return false
    }
    expect(hasTextSmAncestor(screen.getByText('Make it softer'))).toBe(true)
    expect(hasTextSmAncestor(screen.getByText('Here is a softer version.'))).toBe(true)
  })
})
