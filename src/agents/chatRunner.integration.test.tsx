import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { runChatTurn, type ApprovalDecision, type WritePreview } from './chatRunner'
import { truncateForRetry, truncateForEditAndRetry } from './retryOrchestrator'
import { ChatPanel, type ChatMessage, type PendingApproval } from '../components/ChatPanel'
import { DialogProvider } from '../lib/dialogs'
import { ContextMenuProvider } from '../lib/contextMenu'
import { makeMockFs, makeCtx } from '../test/fixtures'
import type { LLMAdapter, CompleteParams, CompleteResult, ToolCall, Message } from '../adapters/types'

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
  const [followLatest, setFollowLatest] = useState(true)
  return (
    <ChatPanel
      messages={messages}
      busy={busy}
      provider="Anthropic"
      model="m"
      onSend={() => {}}
      onClear={() => {}}
      onStop={() => {}}
      onRetry={() => {}}
      onEditAndRetry={() => {}}
      pendingApprovals={noApprovals}
      onApprovalDecide={() => {}}
      pricingOverrides={{}}
      followLatest={followLatest}
      onSetFollowLatest={setFollowLatest}
      contextFileName={null}
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

interface RetryApi {
  retryFromAnchor: (anchorId: string) => void
  editAndRetry: (newText: string) => void
  undoRetry: () => void
  getMessages: () => ChatMessage[]
}

function RetryHost({
  adapter,
  initialMessages,
  exposeApi,
}: {
  adapter: LLMAdapter
  initialMessages?: ChatMessage[]
  exposeApi?: (api: RetryApi) => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? [])
  const [busy, setBusy] = useState(false)
  const chatAbort = useRef<AbortController | null>(null)
  const runningRef = useRef(false)
  const lastDiscardedRef = useRef<{ previous: ChatMessage[]; discarded: ChatMessage[] } | null>(null)

  const fs = makeMockFs({})

  const runTurn = async (history: ChatMessage[]) => {
    if (runningRef.current) return
    runningRef.current = true
    setBusy(true)
    setMessages(history)
    const controller = new AbortController()
    chatAbort.current = controller
    try {
      await runChatTurn({
        adapter,
        provider: 'anthropic',
        history,
        inventoryText: 'inv',
        systemPreamble: 'You are helpful.',
        toolBudget: 10,
        toolCtx: makeCtx({ fs }),
        requestApproval: async () => 'approve' as const,
        onUpdate: (m) => setMessages([...m]),
        model: 'm',
        maxTokens: 512,
        apiKey: 'k',
        signal: controller.signal,
      })
    } finally {
      runningRef.current = false
      setBusy(false)
      chatAbort.current = null
    }
  }

  const retryFromAnchor = (anchorId: string) => {
    const { kept, discarded } = truncateForRetry(messages, anchorId)
    lastDiscardedRef.current = { previous: messages, discarded }
    void runTurn(kept)
  }
  const editAndRetry = (newText: string) => {
    const { kept, discarded } = truncateForEditAndRetry(messages, newText)
    lastDiscardedRef.current = { previous: messages, discarded }
    void runTurn(kept)
  }
  const undoRetry = () => {
    chatAbort.current?.abort()
    chatAbort.current = null
    runningRef.current = false
    setBusy(false)
    const stash = lastDiscardedRef.current
    if (!stash) return
    setMessages(stash.previous)
    lastDiscardedRef.current = null
  }

  useEffect(() => {
    exposeApi?.({ retryFromAnchor, editAndRetry, undoRetry, getMessages: () => messages })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])

  const noApprovals = new Map<string, PendingApproval>()
  return (
    <ChatPanel
      messages={messages}
      busy={busy}
      provider="Anthropic"
      model="m"
      onSend={() => {}}
      onClear={() => {}}
      onStop={() => { chatAbort.current?.abort() }}
      onRetry={retryFromAnchor}
      onEditAndRetry={editAndRetry}
      pendingApprovals={noApprovals}
      onApprovalDecide={() => {}}
      pricingOverrides={{}}
      followLatest={true}
      onSetFollowLatest={() => {}}
      contextFileName={null}
    />
  )
}

describe('A3 retry integration', () => {
  it('retry after cancel: failed turn is not in the provider payload', async () => {
    const sentBodies: Message[][] = []
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams): Promise<CompleteResult> {
        sentBodies.push([...p.messages])
        return { text: 'fresh reply', truncated: false, stopReason: 'end_turn' }
      },
    }
    const initial: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'hi', provider: 'anthropic' },
      { id: 'a1', role: 'assistant', content: '', provider: 'anthropic', failureReason: 'cancelled' },
    ]
    let api: RetryApi | null = null
    render(<RetryHost adapter={adapter} initialMessages={initial} exposeApi={(a) => { api = a }} />)
    await waitFor(() => expect(api).not.toBeNull())
    api!.retryFromAnchor('a1')
    await waitFor(() => expect(sentBodies.length).toBeGreaterThan(0))
    // Single adapter call's payload should contain only u1 — no failed assistant.
    expect(sentBodies[0].length).toBe(1)
    expect(sentBodies[0][0]).toEqual({ role: 'user', content: 'hi' })
    // And the resulting messages include the fresh reply.
    await waitFor(() => {
      expect(api!.getMessages().some((m) => m.role === 'assistant' && m.content === 'fresh reply')).toBe(true)
    })
  })

  it('retry after provider error: failed message is filtered from second payload', async () => {
    const sentBodies: Message[][] = []
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams): Promise<CompleteResult> {
        sentBodies.push([...p.messages])
        return { text: 'success', truncated: false, stopReason: 'end_turn' }
      },
    }
    const initial: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'hi', provider: 'anthropic' },
      {
        id: 'a1', role: 'assistant', content: '', provider: 'anthropic',
        failureReason: 'provider_error',
        errorInfo: { kind: 'server', message: 'boom', statusCode: 500 },
      },
    ]
    let api: RetryApi | null = null
    render(<RetryHost adapter={adapter} initialMessages={initial} exposeApi={(a) => { api = a }} />)
    await waitFor(() => expect(api).not.toBeNull())
    api!.retryFromAnchor('a1')
    await waitFor(() => expect(sentBodies.length).toBeGreaterThan(0))
    expect(sentBodies[0].length).toBe(1)
    expect(sentBodies[0][0].role).toBe('user')
    expect((sentBodies[0][0] as { content: string }).content).toBe('hi')
  })

  it('retry from earlier message: provider receives only history up to the anchor', async () => {
    const sentBodies: Message[][] = []
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams): Promise<CompleteResult> {
        sentBodies.push([...p.messages])
        return { text: 'rewritten', truncated: false, stopReason: 'end_turn' }
      },
    }
    const initial: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'first', provider: 'anthropic' },
      { id: 'a1', role: 'assistant', content: 'reply 1', provider: 'anthropic' },
      { id: 'u2', role: 'user', content: 'second' },
      { id: 'a2', role: 'assistant', content: 'reply 2', provider: 'anthropic' },
    ]
    let api: RetryApi | null = null
    render(<RetryHost adapter={adapter} initialMessages={initial} exposeApi={(a) => { api = a }} />)
    await waitFor(() => expect(api).not.toBeNull())
    api!.retryFromAnchor('u1')
    await waitFor(() => expect(sentBodies.length).toBeGreaterThan(0))
    expect(sentBodies[0].length).toBe(1)
    expect(sentBodies[0][0]).toEqual({ role: 'user', content: 'first' })
    // Resulting state: kept history [u1] + new assistant 'rewritten'.
    await waitFor(() => {
      const m = api!.getMessages()
      expect(m.length).toBe(2)
      expect(m[0].id).toBe('u1')
      expect(m[1].role).toBe('assistant')
      expect(m[1].content).toBe('rewritten')
    })
  })

  it('undo restores history and aborts the in-flight new run', async () => {
    let abortObserved = false
    const holder: { resolve: ((v: CompleteResult) => void) | null } = { resolve: null }
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      complete(p: CompleteParams): Promise<CompleteResult> {
        return new Promise<CompleteResult>((resolve, reject) => {
          holder.resolve = resolve
          if (p.signal) {
            p.signal.addEventListener('abort', () => {
              abortObserved = true
              const err = new Error('aborted')
              err.name = 'AbortError'
              reject(err)
            })
          }
        })
      },
    }
    const initial: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'first', provider: 'anthropic' },
      { id: 'a1', role: 'assistant', content: 'reply 1', provider: 'anthropic' },
      { id: 'u2', role: 'user', content: 'second' },
      { id: 'a2', role: 'assistant', content: '', provider: 'anthropic', failureReason: 'cancelled' },
    ]
    let api: RetryApi | null = null
    render(<RetryHost adapter={adapter} initialMessages={initial} exposeApi={(a) => { api = a }} />)
    await waitFor(() => expect(api).not.toBeNull())
    api!.retryFromAnchor('a2')
    // Wait for runTurn to enter the adapter (i.e. until holder.resolve has been set).
    await waitFor(() => expect(holder.resolve).not.toBeNull())
    // Now click undo (mid-stream).
    api!.undoRetry()
    await waitFor(() => expect(abortObserved).toBe(true))
    // Messages restored to the original 4 (including the failed a2).
    await waitFor(() => {
      const m = api!.getMessages()
      expect(m.length).toBe(4)
      expect(m.map((x) => x.id)).toEqual(['u1', 'a1', 'u2', 'a2'])
    })
    // Avoid leaving a dangling unsettled promise — release it.
    holder.resolve?.({ text: '', truncated: false, stopReason: 'cancelled' })
  })

  it('editAndRetry: replaces last user text and excludes failed turn from the payload', async () => {
    const sentBodies: Message[][] = []
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams): Promise<CompleteResult> {
        sentBodies.push([...p.messages])
        return { text: 'rewritten reply', truncated: false, stopReason: 'end_turn' }
      },
    }
    const initial: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'first', provider: 'anthropic' },
      { id: 'a1', role: 'assistant', content: 'reply 1' },
      { id: 'u2', role: 'user', content: 'original second', provider: 'anthropic' },
      { id: 'a2', role: 'assistant', content: '', failureReason: 'cancelled' },
    ]
    let api: RetryApi | null = null
    render(<RetryHost adapter={adapter} initialMessages={initial} exposeApi={(a) => { api = a }} />)
    await waitFor(() => expect(api).not.toBeNull())
    api!.editAndRetry('second EDITED')
    await waitFor(() => expect(sentBodies.length).toBeGreaterThan(0))
    // Payload contains u1, a1 (clean), and the edited u2 — but no failed a2.
    const payload = sentBodies[0]
    expect(payload.find((m) => m.role === 'user' && m.content === 'second EDITED')).toBeTruthy()
    expect(payload.find((m) => m.role === 'user' && m.content === 'original second')).toBeUndefined()
    expect(payload.find((m) => m.role === 'assistant' && (m as { content: string }).content === '')).toBeUndefined()
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
