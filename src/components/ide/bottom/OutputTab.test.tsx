import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { OutputTab } from './OutputTab'
import type { RunRecord } from '../../ResultsPanel'
import type { ChatSession } from '../../../hooks/useChatSessions'
import type { ChatMessage } from '../../ChatPanel'

const baseRun = (over: Partial<RunRecord> = {}): RunRecord => ({
  id: 'r1', agentId: 'a', agentLabel: 'Rewrite',
  model: 'm', provider: 'anthropic',
  sourceText: '', range: null, response: 'hi', status: 'done',
  timestamp: Date.now(),
  ...over,
})

const u = (id: string, c: string): ChatMessage => ({ id, role: 'user', content: c })
const a = (id: string, c: string): ChatMessage => ({ id, role: 'assistant', content: c })

const sess = (id: string, msgs: ChatMessage[] = []): ChatSession => ({
  id, createdAt: Date.now(), provider: 'anthropic', model: 'claude-test', messages: msgs,
})

describe('OutputTab', () => {
  it('renders the empty state when there are no runs and chat props are absent', () => {
    render(<OutputTab runs={[]} />)
    expect(screen.getByText(/Run an agent/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/output source/i)).toBeNull()
  })

  it('hides the source dropdown when chat props are absent', () => {
    render(<OutputTab runs={[baseRun()]} />)
    expect(screen.queryByLabelText(/output source/i)).toBeNull()
  })

  it('shows the source dropdown when chat props are present', () => {
    const session = sess('cs-1', [u('u1', 'hi'), a('a1', 'hello')])
    render(
      <OutputTab
        runs={[baseRun()]}
        sessions={[{ id: session.id, title: 'cs-1', busy: false, pendingApprovalCount: 0 }]}
        activeSessionId={session.id}
        getSession={(id) => (id === session.id ? session : null)}
        chatSystemPreamble="SYSTEM"
      />,
    )
    const sourceSel = screen.getByLabelText<HTMLSelectElement>(/output source/i)
    expect(sourceSel).toBeInTheDocument()
    expect(sourceSel.value).toBe('runs')
    expect(Array.from(sourceSel.options).map((o) => o.value)).toEqual(['runs', 'chats'])
  })

  it('switches body to ChatInspector when Chats source is selected', () => {
    const session = sess('cs-1', [u('u1', 'hi'), a('a1', 'hello')])
    render(
      <OutputTab
        runs={[baseRun()]}
        sessions={[{ id: session.id, title: 'cs-1', busy: false, pendingApprovalCount: 0 }]}
        activeSessionId={session.id}
        getSession={(id) => (id === session.id ? session : null)}
        chatSystemPreamble="SYSTEM"
      />,
    )
    const sourceSel = screen.getByLabelText<HTMLSelectElement>(/output source/i)
    fireEvent.change(sourceSel, { target: { value: 'chats' } })
    expect(screen.getByTestId('chat-meta')).toBeInTheDocument()
  })

  it('defaults to the active session when Chats is opened', () => {
    const a1 = sess('cs-1', [u('u1', 'first'), a('a1', 'r1')])
    const a2 = sess('cs-2', [u('u2', 'second'), a('a2', 'r2')])
    render(
      <OutputTab
        runs={[]}
        sessions={[
          { id: 'cs-1', title: 'one', busy: false, pendingApprovalCount: 0 },
          { id: 'cs-2', title: 'two', busy: false, pendingApprovalCount: 0 },
        ]}
        activeSessionId="cs-2"
        getSession={(id) => (id === 'cs-1' ? a1 : id === 'cs-2' ? a2 : null)}
        chatSystemPreamble="SYSTEM"
      />,
    )
    // No runs → defaults to Chats source, picks active session.
    const sessionSel = screen.getByLabelText<HTMLSelectElement>(/select chat session/i)
    expect(sessionSel.value).toBe('cs-2')
  })

  it('Copy session (JSON) button is present in Chats mode', () => {
    const session = sess('cs-1', [u('u1', 'hi'), a('a1', 'hello')])
    render(
      <OutputTab
        runs={[]}
        sessions={[{ id: session.id, title: 'one', busy: false, pendingApprovalCount: 0 }]}
        activeSessionId={session.id}
        getSession={(id) => (id === session.id ? session : null)}
        chatSystemPreamble="SYSTEM"
      />,
    )
    expect(screen.getByRole('button', { name: /Copy session \(JSON\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Copy transcript/i })).toBeInTheDocument()
  })
})
