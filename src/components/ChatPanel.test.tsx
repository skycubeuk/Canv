import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import type { ComponentProps, ReactElement, ReactNode } from 'react'
import { ChatPanel } from './ChatPanel'
import type { ChatMessage } from './ChatPanel'
import { DialogProvider } from '../lib/dialogs'
import { ContextMenuProvider } from '../lib/contextMenu'

// jsdom doesn't implement scrollTo — patch it
beforeAll(() => {
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo
})

function Providers({ children }: { children: ReactNode }) {
  return (
    <DialogProvider>
      <ContextMenuProvider>{children}</ContextMenuProvider>
    </DialogProvider>
  )
}

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Providers })

const baseProps = {
  busy: false, provider: 'Anthropic', model: 'claude-sonnet-4-6',
  onSend: () => {}, onClear: () => {}, onStop: () => {},
  pendingApprovals: new Map(),
  onApprovalDecide: () => {},
  pricingOverrides: {},
  followLatest: true,
  onSetFollowLatest: vi.fn(),
  contextFileName: null,
}

describe('ChatPanel — tool rendering', () => {
  it('renders tool call chips for read-only tools', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'read a.md' },
      {
        id: 'a1', role: 'assistant', content: 'reading',
        toolCalls: [{ id: 'c1', name: 'read_file', input: { path: 'a.md' } }],
        toolResults: [{ id: 'c1', content: '{"content":"hi","mtimeMs":1}' }],
      },
    ]
    render(<ChatPanel {...baseProps} messages={messages} />)
    // The chip renders the path in its headline; there may be multiple matches so use getAllBy
    expect(screen.getAllByText(/a\.md/).length).toBeGreaterThan(0)
    // Confirm the chip itself is present
    expect(screen.getByTestId('chip-root')).toBeInTheDocument()
  })

  it('renders an approval card for pending mutating calls', () => {
    const onDecide = vi.fn()
    const pending = new Map([['c1', {
      callId: 'c1',
      preview: { kind: 'create' as const, path: 'new.md', size: 0, contentPreview: '' },
      state: 'pending' as const,
    }]])
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'create new.md' },
      {
        id: 'a1', role: 'assistant', content: '',
        toolCalls: [{ id: 'c1', name: 'create_file', input: { path: 'new.md' } }],
      },
    ]
    render(<ChatPanel {...baseProps} messages={messages} pendingApprovals={pending} onApprovalDecide={onDecide} />)
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }))
    expect(onDecide).toHaveBeenCalledWith('c1', 'approve')
  })
})

describe('ChatPanel — meter', () => {
  it('renders the token meter when there are messages', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'hi' },
      { id: 'a1', role: 'assistant', content: 'hello', tokenUsage: { input: 100, output: 50 } },
    ]
    render(
      <ChatPanel
        {...baseProps}
        messages={messages}
        pricingOverrides={{}}
      />,
    )
    expect(screen.getByLabelText(/token and cost meter/i)).toBeInTheDocument()
  })

  it('does not render the meter when there are no messages', () => {
    render(<ChatPanel {...baseProps} messages={[]} pricingOverrides={{}} />)
    expect(screen.queryByLabelText(/token and cost meter/i)).not.toBeInTheDocument()
  })
})

describe('ChatPanel — stopReason', () => {
  it('renders a "Stopped" pill on cancelled assistant messages', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'q' },
      { id: 'a1', role: 'assistant', content: 'partial answer', stopReason: 'cancelled', provider: 'anthropic' },
    ]
    render(<ChatPanel {...baseProps} messages={messages} />)
    expect(screen.getByText('partial answer')).toBeInTheDocument()
    expect(screen.getByText('Stopped')).toBeInTheDocument()
  })

  it('does not render the pill on normal assistant messages', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'q' },
      { id: 'a1', role: 'assistant', content: 'normal answer', provider: 'anthropic' },
    ]
    render(<ChatPanel {...baseProps} messages={messages} />)
    expect(screen.queryByText('Stopped')).not.toBeInTheDocument()
  })

  it('passes status="cancelled" to chips when tool_result was synthesised by abort', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'q' },
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        stopReason: 'cancelled',
        provider: 'anthropic',
        toolCalls: [{ id: 'c1', name: 'read_file', input: { path: 'a.md' } }],
        toolResults: [{ id: 'c1', content: 'Cancelled by user', isError: true }],
      },
    ]
    render(<ChatPanel {...baseProps} messages={messages} />)
    const root = screen.getByTestId('chip-root')
    expect(root.className).not.toMatch(/border-red-300/)
    expect(root.className).toMatch(/opacity-60|line-through/)
  })
})

describe('ChatPanel — auto-scroll intent', () => {
  // jsdom doesn't compute layout. Stub the geometry properties on the scroll
  // container the component reads. We grab it by data-testid added in T5.3.
  function setGeometry(el: HTMLElement, opts: { scrollTop: number; scrollHeight: number; clientHeight: number }) {
    Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => opts.scrollTop, set: vi.fn() })
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => opts.scrollHeight })
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => opts.clientHeight })
  }

  // Wrapper that holds real followLatest state so scroll-triggered callbacks
  // actually update the component (onSetFollowLatest is now a prop, not local state).
  function StatefulChatPanel(props: Omit<ComponentProps<typeof ChatPanel>, 'followLatest' | 'onSetFollowLatest'>) {
    const [followLatest, setFollowLatest] = useState(true)
    return <ChatPanel {...props} followLatest={followLatest} onSetFollowLatest={setFollowLatest} />
  }

  it('shows the jump-to-latest pill after a user scroll-up of more than 40px', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'hi' },
      { id: 'a1', role: 'assistant', content: 'hello' },
    ]
    render(<StatefulChatPanel {...baseProps} messages={messages} busy={true} />)
    const list = screen.getByTestId('chat-message-list')
    // user scrolled up: distanceFromBottom = 100 - 50 - 0 = 50 > 40
    setGeometry(list, { scrollTop: 0, scrollHeight: 100, clientHeight: 50 })
    fireEvent.scroll(list)
    expect(screen.getByRole('button', { name: /jump to latest/i })).toBeInTheDocument()
  })

  it('hides the pill again when the user scrolls within 8px of the bottom', () => {
    const messages: ChatMessage[] = [{ id: 'a1', role: 'assistant', content: 'x' }]
    render(<StatefulChatPanel {...baseProps} messages={messages} busy={true} />)
    const list = screen.getByTestId('chat-message-list')
    setGeometry(list, { scrollTop: 0, scrollHeight: 200, clientHeight: 100 })
    fireEvent.scroll(list)
    expect(screen.getByRole('button', { name: /jump to latest/i })).toBeInTheDocument()
    setGeometry(list, { scrollTop: 96, scrollHeight: 200, clientHeight: 100 }) // dist = 4
    fireEvent.scroll(list)
    expect(screen.queryByRole('button', { name: /jump to latest/i })).not.toBeInTheDocument()
  })

  it('clicking the pill scrolls to bottom and hides it', () => {
    const messages: ChatMessage[] = [{ id: 'a1', role: 'assistant', content: 'x' }]
    render(<StatefulChatPanel {...baseProps} messages={messages} busy={true} />)
    const list = screen.getByTestId('chat-message-list')
    setGeometry(list, { scrollTop: 0, scrollHeight: 200, clientHeight: 100 })
    fireEvent.scroll(list)
    const pill = screen.getByRole('button', { name: /jump to latest/i })
    setGeometry(list, { scrollTop: 100, scrollHeight: 200, clientHeight: 100 }) // dist = 0
    fireEvent.click(pill)
    expect(screen.queryByRole('button', { name: /jump to latest/i })).not.toBeInTheDocument()
  })
})
