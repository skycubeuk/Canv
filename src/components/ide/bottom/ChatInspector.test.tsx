import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatInspector } from './ChatInspector'
import type { ChatSession } from '../../../hooks/useChatSessions'
import type { ChatMessage } from '../../ChatPanel'

const u = (id: string, content: string): ChatMessage => ({ id, role: 'user', content })
const a = (id: string, content: string, extras: Partial<ChatMessage> = {}): ChatMessage => ({
  id, role: 'assistant', content, ...extras,
})

const session: ChatSession = {
  id: 'cs-1',
  createdAt: 1_700_000_000_000,
  provider: 'anthropic',
  model: 'claude-test',
  messages: [
    u('u1', 'hello'),
    a('a1', 'hi', { tokenUsage: { input: 10, output: 5 } }),
    u('u2', 'and again'),
    a('a2', 'sure', { tokenUsage: { input: 7, output: 3 } }),
  ],
}

describe('ChatInspector', () => {
  it('renders a meta strip with provider, model, turn count, total tokens', () => {
    render(<ChatInspector session={session} systemText="SYSTEM" />)
    const meta = screen.getByTestId('chat-meta')
    expect(meta.textContent).toMatch(/anthropic/)
    expect(meta.textContent).toMatch(/claude-test/)
    expect(meta.textContent).toMatch(/2 turns/)
    expect(meta.textContent).toMatch(/in 17/)
    expect(meta.textContent).toMatch(/out 8/)
  })

  it('renders the system preamble inside a CollapsibleBlob (collapsed by default)', () => {
    render(<ChatInspector session={session} systemText="SYS PREAMBLE TEXT" />)
    expect(screen.getByText(/system/i)).toBeInTheDocument()
    expect(screen.queryByTestId('collapsible-body')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /system/i }))
    expect(screen.getByTestId('collapsible-body').textContent).toContain('SYS PREAMBLE TEXT')
  })

  it('renders one turn block per assistant message', () => {
    render(<ChatInspector session={session} systemText="" />)
    const turns = screen.getAllByTestId('turn-section')
    expect(turns).toHaveLength(2)
  })

  it('shows the empty-turns message when the session has no assistant messages yet', () => {
    const empty: ChatSession = { ...session, messages: [] }
    render(<ChatInspector session={empty} systemText="x" />)
    expect(screen.getByText(/no turns yet/i)).toBeInTheDocument()
  })

  it('handles an assistant message with no preceding user (orphan) by rendering with an empty user trigger', () => {
    const odd: ChatSession = {
      ...session,
      messages: [a('a1', 'orphan')],
    }
    render(<ChatInspector session={odd} systemText="" />)
    const turns = screen.getAllByTestId('turn-section')
    expect(turns).toHaveLength(1)
    expect(screen.getByText(/orphan/)).toBeInTheDocument()
  })
})
