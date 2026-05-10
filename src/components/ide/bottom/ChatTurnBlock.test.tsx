import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatTurnBlock } from './ChatTurnBlock'
import type { ChatMessage } from '../../ChatPanel'

const userMsg: ChatMessage = {
  id: 'u1',
  role: 'user',
  content: 'Read README.md and summarise.',
}

const assistantMsg: ChatMessage = {
  id: 'a1',
  role: 'assistant',
  content: 'On it.',
  stopReason: 'tool_use',
  tokenUsage: { input: 100, output: 12 },
  toolCalls: [
    { id: 'toolu_01abc', name: 'read_file', input: { path: 'README.md' } },
  ],
  toolResults: [
    { id: 'toolu_01abc', content: '# Hello\n\nworld' },
  ],
}

describe('ChatTurnBlock', () => {
  it('renders the user trigger text and the assistant text', () => {
    render(<ChatTurnBlock turnIndex={1} userMessage={userMsg} assistantMessage={assistantMsg} />)
    expect(screen.getByText(/Read README\.md and summarise/)).toBeInTheDocument()
    expect(screen.getByText(/On it\./)).toBeInTheDocument()
  })

  it('renders a per-turn meta line with stop reason and tokens', () => {
    render(<ChatTurnBlock turnIndex={1} userMessage={userMsg} assistantMessage={assistantMsg} />)
    expect(screen.getByTestId('turn-meta').textContent).toMatch(/tool_use/)
    expect(screen.getByTestId('turn-meta').textContent).toMatch(/100/)
    expect(screen.getByTestId('turn-meta').textContent).toMatch(/12/)
  })

  it('renders a CollapsibleBlob per tool call (collapsed by default)', () => {
    render(<ChatTurnBlock turnIndex={1} userMessage={userMsg} assistantMessage={assistantMsg} />)
    expect(screen.getByText(/tool_call · read_file/)).toBeInTheDocument()
    expect(screen.queryByTestId('collapsible-body')).toBeNull()
  })

  it('renders a CollapsibleBlob per tool result', () => {
    render(<ChatTurnBlock turnIndex={1} userMessage={userMsg} assistantMessage={assistantMsg} />)
    expect(screen.getByText(/tool_result · toolu_01a/)).toBeInTheDocument()
  })

  it('expanding a tool-call chip reveals pretty-printed JSON of its input', () => {
    render(<ChatTurnBlock turnIndex={1} userMessage={userMsg} assistantMessage={assistantMsg} />)
    fireEvent.click(screen.getByRole('button', { name: /tool_call · read_file/ }))
    const body = screen.getByTestId('collapsible-body')
    expect(body.textContent).toContain('"path": "README.md"')
  })

  it('renders synthetic note when assistant message is synthetic', () => {
    const synth: ChatMessage = { id: 's1', role: 'assistant', content: '(turn cancelled)', synthetic: true }
    render(<ChatTurnBlock turnIndex={1} userMessage={userMsg} assistantMessage={synth} />)
    expect(screen.getByText(/turn cancelled/)).toBeInTheDocument()
    expect(screen.getByTestId('synthetic-note')).toBeInTheDocument()
  })

  it('renders an error section when assistant message has failureReason=provider_error', () => {
    const fail: ChatMessage = {
      id: 'f1',
      role: 'assistant',
      content: '',
      failureReason: 'provider_error',
      errorInfo: { kind: 'rate_limited', message: 'slow down', statusCode: 429 },
    }
    render(<ChatTurnBlock turnIndex={1} userMessage={userMsg} assistantMessage={fail} />)
    expect(screen.getByTestId('turn-error').textContent).toMatch(/slow down/)
  })

  it('marks tool result with isError as error and isUserDenial as denied', () => {
    const a: ChatMessage = {
      id: 'a2', role: 'assistant', content: '',
      toolCalls: [
        { id: 't1', name: 'edit_file', input: {} },
        { id: 't2', name: 'read_file', input: {} },
      ],
      toolResults: [
        { id: 't1', content: 'denied by user', isUserDenial: true },
        { id: 't2', content: 'boom', isError: true },
      ],
    }
    render(<ChatTurnBlock turnIndex={1} userMessage={userMsg} assistantMessage={a} />)
    expect(screen.getByText('denied')).toBeInTheDocument()
    expect(screen.getByText('err')).toBeInTheDocument()
  })
})
