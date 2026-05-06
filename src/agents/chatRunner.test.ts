import { describe, it, expect } from 'vitest'
import { runChatTurn, type ApprovalDecision } from './chatRunner'
import type { LLMAdapter, CompleteParams, CompleteResult } from '../adapters/types'
import type { ChatMessage } from '../components/ChatPanel'
import { makeMockFs, makeCtx } from '../test/fixtures'

function adapterReturning(seq: CompleteResult[]): LLMAdapter {
  let i = 0
  return {
    id: 'mock', name: 'Mock', models: ['m'],
    async complete(_p: CompleteParams): Promise<CompleteResult> {
      const next = seq[i++] ?? seq[seq.length - 1]
      _p.onToken?.(next.text)
      return next
    },
  }
}

const baseCtx = {
  fs: makeMockFs({}),
  inventoryText: 'inv',
  systemPreamble: 'You are a helpful assistant.',
  toolBudget: 10,
  toolCtx: makeCtx({ fs: makeMockFs({}) }),
  requestApproval: async () => 'approve' as const,
  model: 'm',
  maxTokens: 512,
  apiKey: 'k',
  signal: new AbortController().signal,
}

describe('chatRunner — basic', () => {
  it('round-trips a single turn with no tools', async () => {
    const adapter = adapterReturning([{ text: 'hello back', truncated: false, stopReason: 'end_turn' }])
    const messages: ChatMessage[] = []
    const onUpdate = (next: ChatMessage[]) => { messages.length = 0; messages.push(...next) }
    await runChatTurn({
      ...baseCtx,
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'hi', provider: 'anthropic' }],
      onUpdate,
    })
    expect(messages.length).toBe(2)
    expect(messages[0]).toMatchObject({ role: 'user', content: 'hi' })
    expect(messages[1]).toMatchObject({ role: 'assistant', content: 'hello back' })
  })

  it('streams tokens via onUpdate as content grows', async () => {
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams) {
        p.onToken?.('he')
        p.onToken?.('llo')
        return { text: 'hello', truncated: false, stopReason: 'end_turn' }
      },
    }
    const updates: string[] = []
    await runChatTurn({
      ...baseCtx,
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'hi', provider: 'anthropic' }],
      onUpdate: (next) => {
        const last = next[next.length - 1]
        if (last?.role === 'assistant') updates.push(last.content)
      },
    })
    expect(updates).toEqual(['', 'he', 'hello', 'hello'])
  })
})

describe('chatRunner — read-only tools', () => {
  it('runs a read_file tool call automatically and returns a tool_result on the next request', async () => {
    const fs = makeMockFs({ 'a.md': { content: 'hello', mtimeMs: 7, size: 5, binary: false } })
    const seenRequests: Array<{ messages: number }> = []
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams) {
        seenRequests.push({ messages: p.messages.length })
        if (seenRequests.length === 1) {
          return {
            text: 'reading…', truncated: false, stopReason: 'tool_use',
            toolCalls: [{ id: 'c1', name: 'read_file', input: { path: 'a.md' } }],
          }
        }
        return { text: 'the file says "hello"', truncated: false, stopReason: 'end_turn' }
      },
    }

    let final: ChatMessage[] = []
    await runChatTurn({
      ...baseCtx,
      toolCtx: makeCtx({ fs }),
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'what does a.md say?', provider: 'anthropic' }],
      onUpdate: (m) => { final = [...m] },
    })

    const assistants = final.filter((m) => m.role === 'assistant')
    expect(assistants).toHaveLength(2)
    expect(assistants[0].toolCalls?.[0].name).toBe('read_file')
    expect(assistants[0].toolResults?.[0].id).toBe('c1')
    expect(assistants[0].toolResults?.[0].isError).toBeUndefined()
    expect(JSON.parse(assistants[0].toolResults![0].content)).toEqual({ content: 'hello', mtimeMs: 7 })
    expect(assistants[1].content).toBe('the file says "hello"')
    expect(seenRequests).toHaveLength(2)
  })

  it('returns isError=true result when handler throws', async () => {
    const fs = makeMockFs({})
    let final: ChatMessage[] = []
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams) {
        if (p.messages.find((m) => m.role === 'tool')) {
          return { text: 'sorry', truncated: false, stopReason: 'end_turn' }
        }
        return {
          text: '', truncated: false, stopReason: 'tool_use',
          toolCalls: [{ id: 'c1', name: 'read_file', input: { path: 'missing.md' } }],
        }
      },
    }

    await runChatTurn({
      ...baseCtx,
      toolCtx: makeCtx({ fs }),
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'read missing', provider: 'anthropic' }],
      onUpdate: (m) => { final = [...m] },
    })

    const firstAsst = final.filter((m) => m.role === 'assistant')[0]
    expect(firstAsst.toolResults![0].isError).toBe(true)
    expect(firstAsst.toolResults![0].content).toMatch(/not found/i)
  })
})

describe('chatRunner — approval gate', () => {
  it('runs handler when requestApproval returns approve', async () => {
    const fs = makeMockFs({})
    const decisions: Array<{ name: string; decision: ApprovalDecision }> = []
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams) {
        if (p.messages.find((m) => m.role === 'tool')) {
          return { text: 'created', truncated: false, stopReason: 'end_turn' }
        }
        return {
          text: '', truncated: false, stopReason: 'tool_use',
          toolCalls: [{ id: 'c1', name: 'create_file', input: { path: 'new.md', content: 'hi' } }],
        }
      },
    }

    let final: ChatMessage[] = []
    await runChatTurn({
      ...baseCtx,
      toolCtx: makeCtx({ fs }),
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'create new.md', provider: 'anthropic' }],
      requestApproval: async (call) => { decisions.push({ name: call.name, decision: 'approve' }); return 'approve' },
      onUpdate: (m) => { final = [...m] },
    })

    expect(decisions).toEqual([{ name: 'create_file', decision: 'approve' }])
    const firstAsst = final.filter((m) => m.role === 'assistant')[0]
    expect(firstAsst.toolResults![0].isError).toBeFalsy()
    expect(await fs.readFile('new.md')).toMatchObject({ content: 'hi' })
  })

  it('skips handler when deny is returned and reports error to model', async () => {
    const fs = makeMockFs({})
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams) {
        if (p.messages.find((m) => m.role === 'tool')) {
          return { text: 'ok skipped', truncated: false, stopReason: 'end_turn' }
        }
        return {
          text: '', truncated: false, stopReason: 'tool_use',
          toolCalls: [{ id: 'c1', name: 'create_file', input: { path: 'new.md', content: 'x' } }],
        }
      },
    }

    let final: ChatMessage[] = []
    await runChatTurn({
      ...baseCtx,
      toolCtx: makeCtx({ fs }),
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'create new.md', provider: 'anthropic' }],
      requestApproval: async () => 'deny',
      onUpdate: (m) => { final = [...m] },
    })

    const firstAsst = final.filter((m) => m.role === 'assistant')[0]
    expect(firstAsst.toolResults![0]).toEqual({ id: 'c1', content: 'User denied this action', isError: true })
    await expect(fs.readFile('new.md')).rejects.toThrow(/ENOENT/)
  })
})

describe('chatRunner — approve-rest', () => {
  it('skips approval prompt for subsequent mutating calls in this user-turn', async () => {
    const fs = makeMockFs({})
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams) {
        const round = p.messages.filter((m) => m.role === 'assistant').length
        if (round === 0) {
          return {
            text: '', truncated: false, stopReason: 'tool_use',
            toolCalls: [
              { id: 'c1', name: 'create_file', input: { path: 'a.md', content: 'a' } },
              { id: 'c2', name: 'create_file', input: { path: 'b.md', content: 'b' } },
            ],
          }
        }
        if (round === 1) {
          return {
            text: '', truncated: false, stopReason: 'tool_use',
            toolCalls: [{ id: 'c3', name: 'create_file', input: { path: 'c.md', content: 'c' } }],
          }
        }
        return { text: 'done', truncated: false, stopReason: 'end_turn' }
      },
    }

    const calls: string[] = []
    await runChatTurn({
      ...baseCtx,
      toolCtx: makeCtx({ fs }),
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'create three', provider: 'anthropic' }],
      requestApproval: async (call) => {
        calls.push(call.id)
        return 'approve-rest'
      },
      onUpdate: () => {},
    })

    expect(calls).toEqual(['c1']) // only the first prompted; c2 and c3 auto-approved
    expect((await fs.readFile('a.md')).content).toBe('a')
    expect((await fs.readFile('b.md')).content).toBe('b')
    expect((await fs.readFile('c.md')).content).toBe('c')
  })
})

describe('chatRunner — iteration cap', () => {
  it('drops tools and asks for finalisation when budget hits', async () => {
    let calls = 0
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams) {
        calls++
        const isFinaliser = !p.tools
        if (isFinaliser) return { text: 'final answer', truncated: false, stopReason: 'end_turn' }
        return {
          text: '', truncated: false, stopReason: 'tool_use',
          toolCalls: [{ id: `c${calls}`, name: 'list_dir', input: { path: '' } }],
        }
      },
    }

    let final: ChatMessage[] = []
    await runChatTurn({
      ...baseCtx,
      toolBudget: 2,
      toolCtx: makeCtx({ fs: makeMockFs({}) }),
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'spin', provider: 'anthropic' }],
      onUpdate: (m) => { final = [...m] },
    })

    // 2 tool rounds + 1 finaliser
    expect(calls).toBe(3)
    expect(final[final.length - 1].content).toBe('final answer')
  })
})

describe('chatRunner — set_todos', () => {
  it('dispatches set_todos through the read-only path with no approval', async () => {
    let approvalCalls = 0
    let call = 0
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(): Promise<CompleteResult> {
        call++
        if (call === 1) {
          return {
            text: '',
            truncated: false,
            stopReason: 'tool_use',
            toolCalls: [{
              id: 'tc-1',
              name: 'set_todos',
              input: {
                todos: [
                  { content: 'Step one', activeForm: 'Doing step one', status: 'in_progress' },
                ],
              },
            }],
          }
        }
        return { text: 'done', truncated: false, stopReason: 'end_turn' }
      },
    }
    const messages: ChatMessage[] = []
    await runChatTurn({
      ...baseCtx,
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'plan', provider: 'anthropic' }],
      onUpdate: (next) => { messages.length = 0; messages.push(...next) },
      requestApproval: async () => { approvalCalls++; return 'approve' as ApprovalDecision },
    })
    expect(approvalCalls).toBe(0)

    const assistant = messages.find((m) => m.role === 'assistant' && m.toolResults?.some((r) => r.id === 'tc-1'))
    expect(assistant).toBeDefined()
    const result = assistant?.toolResults?.find((r) => r.id === 'tc-1')
    expect(result?.isError).toBeFalsy()
    expect(JSON.parse(result?.content ?? '{}')).toEqual({
      todos: [
        { content: 'Step one', activeForm: 'Doing step one', status: 'in_progress' },
      ],
    })
  })
})

describe('chatRunner — abort', () => {
  it('stops cleanly mid-stream when signal aborts', async () => {
    const ctrl = new AbortController()
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams) {
        await new Promise<void>((_resolve, reject) => {
          p.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
        return { text: '', truncated: false, stopReason: 'end_turn' }
      },
    }
    const promise = runChatTurn({
      ...baseCtx,
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'hi', provider: 'anthropic' }],
      signal: ctrl.signal,
      onUpdate: () => {},
    })
    queueMicrotask(() => ctrl.abort())
    await expect(promise).rejects.toThrow(/abort/i)
  })

  it('cancels pending approval when signal aborts', async () => {
    const ctrl = new AbortController()
    const fs = makeMockFs({})
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(_p: CompleteParams) {
        return {
          text: '', truncated: false, stopReason: 'tool_use',
          toolCalls: [{ id: 'c1', name: 'create_file', input: { path: 'a.md' } }],
        }
      },
    }
    const promise = runChatTurn({
      ...baseCtx,
      toolCtx: makeCtx({ fs }),
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'create', provider: 'anthropic' }],
      signal: ctrl.signal,
      requestApproval: () => new Promise<ApprovalDecision>((_resolve, reject) => {
        ctrl.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }),
      onUpdate: () => {},
    })
    queueMicrotask(() => ctrl.abort())
    await expect(promise).rejects.toThrow(/abort/i)
    await expect(fs.readFile('a.md')).rejects.toThrow(/ENOENT/)
  })
})
