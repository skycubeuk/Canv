import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { runChatTurn, type ApprovalDecision, type WritePreview } from './chatRunner'
import { ChatPanel, type ChatMessage, type PendingApproval } from '../components/ChatPanel'
import { DialogProvider } from '../lib/dialogs'
import { ContextMenuProvider } from '../lib/contextMenu'
import { makeMockFs, makeCtx } from '../test/fixtures'
import type { LLMAdapter, CompleteParams, CompleteResult, ToolCall } from '../adapters/types'

beforeAll(() => {
  // jsdom doesn't implement scrollTo
  Element.prototype.scrollTo = vi.fn() as unknown as typeof Element.prototype.scrollTo
})

function Providers({ children }: { children: ReactNode }) {
  return (
    <DialogProvider>
      <ContextMenuProvider>{children}</ContextMenuProvider>
    </DialogProvider>
  )
}

function Host({ adapter }: { adapter: LLMAdapter }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const sentRef = useRef(false)

  const fs = makeMockFs({ 'a.md': { content: 'hello world', mtimeMs: 5, size: 11, binary: false } })

  const send = async (text: string) => {
    if (busy) return
    setBusy(true)
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      provider: 'anthropic',
    }
    const next = [...messages, userMsg]
    setMessages(next)
    try {
      await runChatTurn({
        adapter,
        provider: 'anthropic',
        history: next,
        inventoryText: 'inv',
        systemPreamble: 'You are helpful.',
        toolBudget: 10,
        toolCtx: makeCtx({ fs }),
        requestApproval: async () => 'approve' as const,
        onUpdate: (m) => setMessages([...m]),
        model: 'm',
        maxTokens: 512,
        apiKey: 'k',
        signal: new AbortController().signal,
      })
    } finally {
      setBusy(false)
    }
  }

  // Auto-trigger one send on mount.
  useEffect(() => {
    if (sentRef.current) return
    sentRef.current = true
    void send('what does a.md say?')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const noApprovals = new Map<string, PendingApproval>()
  return (
    <ChatPanel
      messages={messages}
      busy={busy}
      provider="Anthropic"
      model="m"
      onSend={() => {}}
      onClear={() => {}}
      onStop={() => {}}
      pendingApprovals={noApprovals}
      onApprovalDecide={() => {}}
      pricingOverrides={{}}
    />
  )
}

const render = (ui: ReactNode) => rtlRender(<Providers>{ui}</Providers>)

describe('chatRunner integration with ChatPanel', () => {
  it('runs a read_file tool call end-to-end and renders the chip + final reply', async () => {
    let calls = 0
    const adapter: LLMAdapter = {
      id: 'mock',
      name: 'Mock',
      models: ['m'],
      async complete(p: CompleteParams): Promise<CompleteResult> {
        calls++
        if (calls === 1) {
          return {
            text: '',
            truncated: false,
            stopReason: 'tool_use',
            toolCalls: [{ id: 'c1', name: 'read_file', input: { path: 'a.md' } }],
          }
        }
        // Drive the final reply through onToken so streaming hits the bubble.
        const final = 'a.md says "hello world"'
        p.onToken?.(final)
        return { text: final, truncated: false, stopReason: 'end_turn' }
      },
    }

    render(<Host adapter={adapter} />)

    await waitFor(() => {
      expect(screen.getByText(/a\.md says/i)).toBeInTheDocument()
    }, { timeout: 2000 })

    // Chip for the read_file call should render with the path.
    expect(screen.getByTestId('chip-root')).toBeInTheDocument()
    // 2 adapter calls: tool round + final
    expect(calls).toBe(2)

    // Avoid unused warning on the unused param.
    void ({} as ToolCall)
    void ({} as ApprovalDecision)
    void ({} as WritePreview)
  })
})

describe('chatRunner integration — set_todos', () => {
  it('renders ChatTodoCard when the model calls set_todos', async () => {
    let call = 0
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(): Promise<CompleteResult> {
        call++
        if (call === 1) {
          const tc: ToolCall = {
            id: 'tc-1',
            name: 'set_todos',
            input: {
              todos: [
                { content: 'Step one', activeForm: 'Doing step one', status: 'in_progress' },
                { content: 'Step two', activeForm: 'Doing step two', status: 'pending' },
              ],
            },
          }
          return { text: '', truncated: false, stopReason: 'tool_use', toolCalls: [tc] }
        }
        return { text: 'done', truncated: false, stopReason: 'end_turn' }
      },
    }

    rtlRender(
      <Providers>
        <Host adapter={adapter} />
      </Providers>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('todo-card')).toBeInTheDocument()
    })
    expect(screen.getByTestId('todo-item-0').textContent).toContain('Doing step one')
    expect(screen.getByTestId('todo-item-1').textContent).toContain('Step two')
  })
})
