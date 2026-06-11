import { describe, it, expect, vi, afterEach } from 'vitest'
import { runChatTurn, pathIsAutoApproved, buildWritePreview, type ApprovalDecision } from './chatRunner'
import type { LLMAdapter, CompleteParams, CompleteResult, Message } from '../adapters/types'
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
    expect(firstAsst.toolResults![0]).toEqual({ id: 'c1', content: 'User denied this action', isError: true, isUserDenial: true })
    expect(firstAsst.toolResults![0].isUserDenial).toBe(true)
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
    expect(await fs.readFile('a.md')).toMatchObject({ ok: true, content: 'a' })
    expect(await fs.readFile('b.md')).toMatchObject({ ok: true, content: 'b' })
    expect(await fs.readFile('c.md')).toMatchObject({ ok: true, content: 'c' })
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

describe('chatRunner — provider error', () => {
  it('captures a thrown adapter error as a synthetic failed assistant message', async () => {
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(_p: CompleteParams): Promise<CompleteResult> {
        throw Object.assign(new Error('boom'), { statusCode: 500 })
      },
    }
    const updates: ChatMessage[][] = []
    await runChatTurn({
      ...baseCtx,
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'hi', provider: 'anthropic' }],
      onUpdate: (m) => updates.push(m.map((x) => ({ ...x }))),
      signal: new AbortController().signal,
    })
    const last = updates.at(-1)!.at(-1)!
    expect(last.role).toBe('assistant')
    expect(last.failureReason).toBe('provider_error')
    expect(last.errorInfo?.message).toBe('boom')
    expect(last.errorInfo?.kind).toBe('server')
    expect(last.errorInfo?.statusCode).toBe(500)
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
    // Runner now swallows AbortError and resolves cleanly — abort handling
    // is the runner's responsibility, not the caller's.
    await expect(promise).resolves.toBeUndefined()
  })

  it('cancels pending approval when signal aborts (resolves with cancelled tool_result)', async () => {
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
    let final: ChatMessage[] = []
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
      onUpdate: (m) => { final = [...m] },
    })
    queueMicrotask(() => ctrl.abort())
    await promise
    // Runner resolves cleanly with a cancelled tool_result, NOT a rejection.
    const asst = final.filter((m) => m.role === 'assistant')[0]
    expect(asst.failureReason).toBe('cancelled')
    expect(asst.toolResults).toEqual([{ id: 'c1', content: 'Cancelled by user', isError: true }])
    // Safety: file was never created.
    await expect(fs.readFile('a.md')).rejects.toThrow(/ENOENT/)
  })
})

describe('chatRunner — cancellation', () => {
  it('handles adapter stopReason="cancelled" with no tool calls (mid-stream abort)', async () => {
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams) {
        p.onToken?.('hello par')
        return { text: 'hello par', truncated: false, stopReason: 'cancelled' }
      },
    }
    let final: ChatMessage[] = []
    await runChatTurn({
      ...baseCtx,
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'hi', provider: 'anthropic' }],
      onUpdate: (m) => { final = [...m] },
    })

    expect(final).toHaveLength(2)
    expect(final[1]).toMatchObject({
      role: 'assistant',
      content: 'hello par',
      failureReason: 'cancelled',
    })
    expect(final[1].toolCalls).toBeUndefined()
    expect(final[1].toolResults).toBeUndefined()
  })

  it('drops partial toolCalls announced via onToolCallStart when adapter returns cancelled with no completed toolCalls', async () => {
    // Reproduces the production bug: model started composing a tool_use,
    // user clicked Stop before content_block_stop, adapter dropped the
    // partial. The runner must not leave the announced partial in
    // assistantMsg.toolCalls — that produces an open tool_use block on the
    // next turn and a provider 400.
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams) {
        p.onToken?.('I am about to write a long file…')
        // Announce a tool_use that will never complete.
        p.onToolCallStart?.({ id: 'toolu_partial', name: 'create_file' })
        return { text: 'I am about to write a long file…', truncated: false, stopReason: 'cancelled' }
      },
    }
    let final: ChatMessage[] = []
    await runChatTurn({
      ...baseCtx,
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'write me a long file', provider: 'anthropic' }],
      onUpdate: (m) => { final = [...m] },
    })

    expect(final).toHaveLength(2)
    expect(final[1].failureReason).toBe('cancelled')
    expect(final[1].content).toBe('I am about to write a long file…')
    // The partial must NOT survive — otherwise the next turn sends an open
    // tool_use to the provider and gets schema-rejected.
    expect(final[1].toolCalls).toBeUndefined()
    expect(final[1].toolResults).toBeUndefined()
  })

  it('cancelled history round-trips cleanly to the next adapter call (no orphan tool_calls/tool_use)', async () => {
    // Two-turn integration: cancelled turn 1 with an announced-but-dropped
    // partial tool_use; turn 2 sends the resulting history back to a mock
    // adapter and checks the messages it sees are well-formed for both
    // Anthropic (no open tool_use) and OpenAI (no orphan tool_call).
    const adapter1: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams) {
        p.onToken?.('thinking…')
        p.onToolCallStart?.({ id: 'toolu_partial', name: 'create_file' })
        return { text: 'thinking…', truncated: false, stopReason: 'cancelled' }
      },
    }
    let history: ChatMessage[] = []
    await runChatTurn({
      ...baseCtx,
      adapter: adapter1,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'write a file', provider: 'anthropic' }],
      onUpdate: (m) => { history = [...m] },
    })

    let seen: CompleteParams | undefined
    const adapter2: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams) {
        seen = p
        return { text: 'ok', truncated: false, stopReason: 'end_turn' }
      },
    }
    await runChatTurn({
      ...baseCtx,
      adapter: adapter2,
      provider: 'anthropic',
      history: [...history, { id: 'u2', role: 'user', content: 'try again', provider: 'anthropic' }],
      onUpdate: () => {},
    })

    // Every assistant message that has tool_calls must be immediately
    // followed by a tool message whose results match every tool_call id.
    // Every tool_call must have a defined `input` (Anthropic schema).
    const msgs = seen!.messages
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i]
      if (m.role === 'assistant' && m.toolCalls?.length) {
        for (const c of m.toolCalls) {
          expect(c.input).toBeDefined()
        }
        const next = msgs[i + 1]
        expect(next?.role).toBe('tool')
        const ids = new Set((next as { toolResults: Array<{ id: string }> }).toolResults.map((r) => r.id))
        for (const c of m.toolCalls) expect(ids.has(c.id)).toBe(true)
      }
    }
  })

  it('synthesises cancelled tool_results when adapter returns cancelled with completed toolCalls', async () => {
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(_p: CompleteParams) {
        return {
          text: 'about to read…',
          truncated: false,
          stopReason: 'cancelled',
          toolCalls: [{ id: 'c1', name: 'read_file', input: { path: 'a.md' } }],
        }
      },
    }
    let final: ChatMessage[] = []
    await runChatTurn({
      ...baseCtx,
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'read a', provider: 'anthropic' }],
      onUpdate: (m) => { final = [...m] },
    })

    expect(final).toHaveLength(2)
    expect(final[1].failureReason).toBe('cancelled')
    expect(final[1].toolCalls).toEqual([{ id: 'c1', name: 'read_file', input: { path: 'a.md' } }])
    expect(final[1].toolResults).toEqual([{ id: 'c1', content: 'Cancelled by user', isError: true }])
  })

  it('synthesises cancelled tool_results when signal aborts after adapter returns tool_use but before dispatch', async () => {
    const ac = new AbortController()
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(_p: CompleteParams) {
        ac.abort()
        return {
          text: '', truncated: false, stopReason: 'tool_use',
          toolCalls: [
            { id: 'c1', name: 'read_file', input: { path: 'a.md' } },
            { id: 'c2', name: 'list_dir', input: { path: '/' } },
          ],
        }
      },
    }
    let final: ChatMessage[] = []
    await runChatTurn({
      ...baseCtx,
      signal: ac.signal,
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'do stuff', provider: 'anthropic' }],
      onUpdate: (m) => { final = [...m] },
    })

    expect(final).toHaveLength(2)
    expect(final[1].failureReason).toBe('cancelled')
    expect(final[1].toolCalls).toHaveLength(2)
    expect(final[1].toolResults).toEqual([
      { id: 'c1', content: 'Cancelled by user', isError: true },
      { id: 'c2', content: 'Cancelled by user', isError: true },
    ])
  })

  it('synthesises cancelled tool_result when abort fires during approval prompt', async () => {
    const ac = new AbortController()
    const fs = makeMockFs({})
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams) {
        if (p.messages.find((m) => m.role === 'tool')) {
          return { text: 'follow-up', truncated: false, stopReason: 'end_turn' }
        }
        return {
          text: '', truncated: false, stopReason: 'tool_use',
          toolCalls: [{ id: 'c1', name: 'create_file', input: { path: 'x.md', content: 'hi' } }],
        }
      },
    }
    const requestApproval = () => new Promise<ApprovalDecision>(() => {
      setTimeout(() => ac.abort(), 0)
    })

    let final: ChatMessage[] = []
    await runChatTurn({
      ...baseCtx,
      toolCtx: makeCtx({ fs }),
      signal: ac.signal,
      requestApproval,
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'create x', provider: 'anthropic' }],
      onUpdate: (m) => { final = [...m] },
    })

    const asst = final.filter((m) => m.role === 'assistant')[0]
    expect(asst.failureReason).toBe('cancelled')
    expect(asst.toolResults).toEqual([{ id: 'c1', content: 'Cancelled by user', isError: true }])
    // File was not created.
    await expect(fs.readFile('x.md')).rejects.toThrow(/ENOENT/)
  })

  it('synthesises cancelled tool_result when abort fires during a read-only tool handler', async () => {
    const ac = new AbortController()
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(_p: CompleteParams) {
        return {
          text: '', truncated: false, stopReason: 'tool_use',
          toolCalls: [{ id: 'c1', name: 'read_file', input: { path: 'slow.md' } }],
        }
      },
    }
    // Need the file present in listDir (read_file handler calls it first to
    // resolve the entry); only readFile itself hangs.
    const fs = makeMockFs({ 'slow.md': { content: 'hi', mtimeMs: 1, size: 2, binary: false } })
    const slowFs = {
      ...fs,
      readFile: () => new Promise<never>((_, reject) => {
        const onAbort = () => reject(new DOMException('aborted', 'AbortError'))
        ac.signal.addEventListener('abort', onAbort, { once: true })
      }),
    }
    setTimeout(() => ac.abort(), 0)

    let final: ChatMessage[] = []
    await runChatTurn({
      ...baseCtx,
      toolCtx: makeCtx({ fs: slowFs }),
      signal: ac.signal,
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'read', provider: 'anthropic' }],
      onUpdate: (m) => { final = [...m] },
    })

    const asst = final.filter((m) => m.role === 'assistant')[0]
    expect(asst.failureReason).toBe('cancelled')
    expect(asst.toolResults).toEqual([{ id: 'c1', content: 'Cancelled by user', isError: true }])
  })

  it('exits cleanly when signal aborts between rounds (post-tool, pre-next-call)', async () => {
    const ac = new AbortController()
    let calls = 0
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(_p: CompleteParams) {
        calls++
        if (calls === 1) {
          return {
            text: '', truncated: false, stopReason: 'tool_use',
            toolCalls: [{ id: 'c1', name: 'read_file', input: { path: 'a.md' } }],
          }
        }
        throw new Error('adapter called after abort')
      },
    }
    const fs = makeMockFs({ 'a.md': { content: 'hi', mtimeMs: 1, size: 2, binary: false } })
    const onUpdate = (m: ChatMessage[]) => {
      const last = m[m.length - 1]
      if (last?.role === 'assistant' && last.toolResults?.length) ac.abort()
    }

    await runChatTurn({
      ...baseCtx,
      toolCtx: makeCtx({ fs }),
      signal: ac.signal,
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'read', provider: 'anthropic' }],
      onUpdate,
    })

    expect(calls).toBe(1)
  })

  it('produces a history that the next provider call accepts (no orphan tool_use blocks)', async () => {
    const ac = new AbortController()
    const adapter1: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(_p: CompleteParams) {
        return {
          text: '',
          truncated: false,
          stopReason: 'cancelled',
          toolCalls: [{ id: 'c1', name: 'read_file', input: { path: 'a.md' } }],
        }
      },
    }
    let history: ChatMessage[] = []
    await runChatTurn({
      ...baseCtx,
      signal: ac.signal,
      adapter: adapter1,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'q', provider: 'anthropic' }],
      onUpdate: (m) => { history = [...m] },
    })

    const asst = history.filter((m) => m.role === 'assistant')[0]
    expect(asst.toolCalls?.[0].id).toBe('c1')
    expect(asst.toolResults?.[0].id).toBe('c1')

    let seen: CompleteParams | undefined
    const adapter2: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams) {
        seen = p
        return { text: 'ok', truncated: false, stopReason: 'end_turn' }
      },
    }
    await runChatTurn({
      ...baseCtx,
      adapter: adapter2,
      provider: 'anthropic',
      history: [...history, { id: 'u2', role: 'user', content: 'try again', provider: 'anthropic' }],
      onUpdate: () => {},
    })

    // The cancelled assistant turn (failureReason: 'cancelled') is dropped at
    // serialisation time, so there are no tool_use blocks (and no tool message)
    // on the wire — the provider sees a clean user-only history.
    const adapterMessages = seen!.messages
    expect(adapterMessages.find((m) => m.role === 'tool')).toBeUndefined()
    expect(adapterMessages.find((m) => m.role === 'assistant')).toBeUndefined()
    expect(adapterMessages.filter((m) => m.role === 'user').map((m) => (m as { content: string }).content)).toEqual(['q', 'try again'])
    for (let i = 0; i < adapterMessages.length; i++) {
      const m = adapterMessages[i]
      if (m.role === 'assistant' && m.toolCalls?.length) {
        const next = adapterMessages[i + 1]
        expect(next?.role).toBe('tool')
        const nextIds = new Set((next as { toolResults: Array<{ id: string }> }).toolResults.map((r) => r.id))
        for (const c of m.toolCalls) expect(nextIds.has(c.id)).toBe(true)
      }
    }
  })
})

describe('pathIsAutoApproved', () => {
  it('approves site_register and site_update by name', () => {
    expect(pathIsAutoApproved({ name: 'site_register', input: {} } as never)).toBe(true)
    expect(pathIsAutoApproved({ name: 'site_update', input: { id: 'x' } } as never)).toBe(true)
  })

  it('approves file mutations under .canv/sites/', () => {
    expect(pathIsAutoApproved({ name: 'create_file', input: { path: '.canv/sites/a/index.html' } } as never)).toBe(true)
    expect(pathIsAutoApproved({ name: 'edit_file', input: { path: '.canv/sites/x/data.json' } } as never)).toBe(true)
    expect(pathIsAutoApproved({ name: 'create_folder', input: { path: '.canv/sites/a' } } as never)).toBe(true)
  })

  it('approves writes to the site_index.yaml registry file', () => {
    expect(pathIsAutoApproved({ name: 'edit_file', input: { path: '.canv/site_index.yaml' } } as never)).toBe(true)
  })

  it('does NOT approve writes elsewhere', () => {
    expect(pathIsAutoApproved({ name: 'edit_file', input: { path: 'notes/foo.md' } } as never)).toBe(false)
    expect(pathIsAutoApproved({ name: 'create_file', input: { path: '.canv/permissions.yaml' } } as never)).toBe(false)
  })

  it('does NOT approve unrelated tools even on whitelisted paths', () => {
    expect(pathIsAutoApproved({ name: 'set_todos', input: { path: '.canv/sites/a/x' } } as never)).toBe(false)
  })

  it('handles rename_file (uses from/to)', () => {
    expect(pathIsAutoApproved({ name: 'rename_file', input: { from: '.canv/sites/a/x', to: '.canv/sites/a/y' } } as never)).toBe(true)
    expect(pathIsAutoApproved({ name: 'rename_file', input: { from: '.canv/sites/a/x', to: 'escape.md' } } as never)).toBe(false)
  })
})

describe('chatRunner — toAdapterMessages filtering', () => {
  it('omits messages with failureReason from the provider payload', async () => {
    const sentBodies: Message[][] = []
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams): Promise<CompleteResult> {
        sentBodies.push(p.messages)
        return { text: 'ok', truncated: false, stopReason: 'end_turn' }
      },
    }
    const history: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'first', provider: 'anthropic' },
      {
        id: 'a1', role: 'assistant', content: '', provider: 'anthropic',
        failureReason: 'provider_error',
        errorInfo: { kind: 'server', message: 'boom' },
      },
      { id: 'u2', role: 'user', content: 'second', provider: 'anthropic' },
    ]
    await runChatTurn({
      ...baseCtx,
      adapter,
      provider: 'anthropic',
      history,
      onUpdate: () => {},
    })
    const sent = sentBodies[0]
    expect(sent.find((m) => m.role === 'assistant' && m.content === '')).toBeUndefined()
    expect(sent.filter((m) => m.role === 'user').map((m) => (m as { content: string }).content)).toEqual(['first', 'second'])
  })

  it('omits synthetic messages from the provider payload', async () => {
    const sentBodies: Message[][] = []
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams): Promise<CompleteResult> {
        sentBodies.push(p.messages)
        return { text: 'ok', truncated: false, stopReason: 'end_turn' }
      },
    }
    const history: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'hi', provider: 'anthropic' },
      { id: 's1', role: 'assistant', content: '(reached max tokens)', provider: 'anthropic', synthetic: true },
      { id: 'u2', role: 'user', content: 'continue', provider: 'anthropic' },
    ]
    await runChatTurn({
      ...baseCtx,
      adapter,
      provider: 'anthropic',
      history,
      onUpdate: () => {},
    })
    const sent = sentBodies[0]
    expect(sent.find((m) => m.role === 'assistant')).toBeUndefined()
    expect(sent.filter((m) => m.role === 'user').map((m) => (m as { content: string }).content)).toEqual(['hi', 'continue'])
  })
})

describe('chatRunner — history brackets', () => {
  function snap(id: string, reason: string) {
    return { id, commit: 'a'.repeat(40), createdAt: 't', reason, summary: '', files: [], hidden: false, metadata: {} }
  }
  function makeHistory() {
    let n = 0
    return {
      init: vi.fn(),
      createSnapshot: vi.fn(async (i: { reason: string }) => snap(`snap_${i.reason}_${++n}`, i.reason)),
      listSnapshots: vi.fn(),
      getSnapshot: vi.fn(),
      diffSnapshot: vi.fn(),
      diffCurrent: vi.fn(),
      getCurrentChanges: vi.fn(),
      restoreFilePreview: vi.fn(),
      restoreFile: vi.fn(),
      hideSnapshot: vi.fn(),
      patchSnapshotFiles: vi.fn(async () => {}),
    }
  }

  it('creates exactly one before_ai_edit and one after_ai_edit per turn with multiple mutating tools', async () => {
    const fs = makeMockFs({})
    const history = makeHistory()
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams) {
        if (p.messages.length === 1) {
          // First request — model issues two mutating tool calls in one round
          return {
            text: '', truncated: false, stopReason: 'tool_use',
            toolCalls: [
              { id: 'c1', name: 'create_file', input: { path: 'a.md', content: 'A' } },
              { id: 'c2', name: 'create_file', input: { path: 'b.md', content: 'B' } },
            ],
          }
        }
        return { text: 'done', truncated: false, stopReason: 'end_turn' }
      },
    }
    await runChatTurn({
      ...baseCtx,
      toolCtx: makeCtx({ fs }),
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'do it', provider: 'anthropic' }],
      onUpdate: () => {},
      historyClient: history as never,
    })
    const reasons = history.createSnapshot.mock.calls.map((c) => (c[0] as { reason: string }).reason)
    expect(reasons).toEqual(['before_ai_edit', 'after_ai_edit'])
    expect(history.patchSnapshotFiles).toHaveBeenCalledTimes(1)
    const patchedFiles = (history.patchSnapshotFiles.mock.calls[0] as unknown as [string, string[]])[1]
    expect(patchedFiles.sort()).toEqual(['a.md', 'b.md'])
  })

  it('skips snapshots entirely when historyClient is null', async () => {
    const history = makeHistory()
    const fs = makeMockFs({})
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams) {
        if (p.messages.length === 1) {
          return {
            text: '', truncated: false, stopReason: 'tool_use',
            toolCalls: [{ id: 'c1', name: 'create_file', input: { path: 'a.md', content: 'A' } }],
          }
        }
        return { text: 'done', truncated: false, stopReason: 'end_turn' }
      },
    }
    await runChatTurn({
      ...baseCtx,
      toolCtx: makeCtx({ fs }),
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'do it', provider: 'anthropic' }],
      onUpdate: () => {},
      historyClient: null,
    })
    expect(history.createSnapshot).not.toHaveBeenCalled()
  })

  it('logs but does not block tool execution when createSnapshot throws', async () => {
    // The runner console.warns the snapshot failure — capture it so the
    // expected error doesn't leak to the test run's stderr.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fs = makeMockFs({})
    const history = makeHistory()
    history.createSnapshot.mockRejectedValueOnce(new Error('boom'))
    const errors: Error[] = []
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams) {
        if (p.messages.length === 1) {
          return {
            text: '', truncated: false, stopReason: 'tool_use',
            toolCalls: [{ id: 'c1', name: 'create_file', input: { path: 'a.md', content: 'A' } }],
          }
        }
        return { text: 'done', truncated: false, stopReason: 'end_turn' }
      },
    }
    await runChatTurn({
      ...baseCtx,
      toolCtx: makeCtx({ fs }),
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'do it', provider: 'anthropic' }],
      onUpdate: () => {},
      historyClient: history as never,
      onHistoryError: (e) => errors.push(e),
    })
    expect(errors[0]?.message).toBe('boom')
    // The tool should still have run — file should exist in the mock FS
    expect(await fs.readFile('a.md')).toMatchObject({ content: 'A' })
    expect(warnSpy).toHaveBeenCalledWith('[chatRunner] before_ai_edit snapshot failed', expect.any(Error))
    warnSpy.mockRestore()
  })
})

describe('chatRunner — MCP integration', () => {
  afterEach(() => {
    // Always clear the bridge between tests — if an assertion above throws,
    // the inline cleanup wouldn't run and the next test would see stale state.
    ;(window as unknown as { canvMcp?: unknown }).canvMcp = undefined
  })

  it('routes <server>__<tool> names to callMcpTool and requires approval', async () => {
    const callTool = vi.fn().mockResolvedValue({ ok: true, result: { msg: 'ok' } })
    ;(window as unknown as { canvMcp: unknown }).canvMcp = {
      setServers: vi.fn(),
      listTools: vi.fn().mockResolvedValue([
        { name: 'srv__t', server: 'srv', description: '', inputSchema: { type: 'object' } },
      ]),
      callTool,
      reconnect: vi.fn(),
    }
    const approvalCalls: string[] = []
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams) {
        if (p.messages.length === 1) {
          return {
            text: '', truncated: false, stopReason: 'tool_use',
            toolCalls: [{ id: 't1', name: 'srv__t', input: { a: 1 } }],
          }
        }
        return { text: 'done', truncated: false, stopReason: 'end_turn' }
      },
    }
    await runChatTurn({
      ...baseCtx,
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'use mcp', provider: 'anthropic' }],
      onUpdate: () => {},
      requestApproval: async (call) => {
        approvalCalls.push(call.name)
        return 'approve' as ApprovalDecision
      },
    })
    expect(approvalCalls).toEqual(['srv__t'])
    expect(callTool).toHaveBeenCalledWith('srv__t', { a: 1 })
  })

  it('exits cleanly when signal aborts mid-MCP-call (parity with native tools)', async () => {
    const ctrl = new AbortController()
    ;(window as unknown as { canvMcp: unknown }).canvMcp = {
      setServers: vi.fn(),
      listTools: vi.fn().mockResolvedValue([
        { name: 'srv__t', server: 'srv', description: '', inputSchema: { type: 'object' } },
      ]),
      // callTool rejects with AbortError as soon as the signal aborts. The
      // bridge's callTool is invoked while signal is still live; the test
      // triggers abort inside the call itself.
      callTool: vi.fn().mockImplementation(() => new Promise<{ ok: false; error: string }>((_resolve, reject) => {
        ctrl.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        // Fire the abort on a macrotask so the runner has time to enter the
        // MCP catch path mid-await rather than aborting before the adapter
        // even runs.
        setTimeout(() => ctrl.abort(), 0)
      })),
      reconnect: vi.fn(),
    }
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams) {
        if (p.messages.length === 1) {
          return {
            text: '', truncated: false, stopReason: 'tool_use',
            toolCalls: [{ id: 't1', name: 'srv__t', input: {} }],
          }
        }
        // Should never run a second round — abort terminated the loop.
        throw new Error('adapter called after abort')
      },
    }
    let final: ChatMessage[] = []
    await runChatTurn({
      ...baseCtx,
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'use mcp', provider: 'anthropic' }],
      signal: ctrl.signal,
      requestApproval: async () => 'approve' as ApprovalDecision,
      onUpdate: (m) => { final = [...m] },
    })
    const asst = final.filter((m) => m.role === 'assistant')[0]
    expect(asst.failureReason).toBe('cancelled')
    expect(asst.toolResults).toEqual([{ id: 't1', content: 'Cancelled by user', isError: true }])
  })
})

describe('chatRunner — Fable 5 refusals and thinking blocks', () => {
  it('marks the assistant turn failed with reason "refusal" and stores stop details', async () => {
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(): Promise<CompleteResult> {
        return {
          text: '', truncated: false, stopReason: 'refusal',
          refusal: { category: 'cyber', explanation: 'Declined: could enable cyber harm.' },
        }
      },
    }
    let final: ChatMessage[] = []
    await runChatTurn({
      ...baseCtx,
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'hi', provider: 'anthropic' }],
      onUpdate: (m) => { final = [...m] },
    })
    const asst = final.filter((m) => m.role === 'assistant')[0]
    expect(asst.failureReason).toBe('refusal')
    expect(asst.refusal).toEqual({ category: 'cyber', explanation: 'Declined: could enable cyber harm.' })
  })

  it('refused turns are dropped from the adapter history on the next request', async () => {
    const seen: Message[][] = []
    let calls = 0
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams): Promise<CompleteResult> {
        seen.push(p.messages)
        calls++
        if (calls === 1) {
          return { text: '', truncated: false, stopReason: 'refusal', refusal: { category: null, explanation: null } }
        }
        return { text: 'ok', truncated: false, stopReason: 'end_turn' }
      },
    }
    let final: ChatMessage[] = []
    const history: ChatMessage[] = [{ id: 'u1', role: 'user', content: 'hi', provider: 'anthropic' }]
    await runChatTurn({ ...baseCtx, adapter, provider: 'anthropic', history, onUpdate: (m) => { final = [...m] } })
    // Second user turn re-uses the accumulated history including the refused turn.
    await runChatTurn({
      ...baseCtx, adapter, provider: 'anthropic',
      history: [...final, { id: 'u2', role: 'user', content: 'again', provider: 'anthropic' }],
      onUpdate: (m) => { final = [...m] },
    })
    expect(seen[1].filter((m) => m.role === 'assistant')).toHaveLength(0)
  })

  it('persists thinkingBlocks on the assistant message and passes them back on the next round', async () => {
    const seen: Message[][] = []
    let calls = 0
    const adapter: LLMAdapter = {
      id: 'mock', name: 'Mock', models: ['m'],
      async complete(p: CompleteParams): Promise<CompleteResult> {
        seen.push(p.messages)
        calls++
        if (calls === 1) {
          return {
            text: 'checking', truncated: false, stopReason: 'tool_use',
            toolCalls: [{ id: 'c1', name: 'read_file', input: { path: 'a.md' } }],
            thinkingBlocks: [{ type: 'thinking', thinking: '', signature: 'sig-1' }],
          }
        }
        return { text: 'done', truncated: false, stopReason: 'end_turn' }
      },
    }
    const fs = makeMockFs({ 'a.md': { content: 'hello', mtimeMs: 1, size: 5, binary: false } })
    let final: ChatMessage[] = []
    await runChatTurn({
      ...baseCtx,
      toolCtx: makeCtx({ fs }),
      adapter,
      provider: 'anthropic',
      history: [{ id: 'u1', role: 'user', content: 'read a.md', provider: 'anthropic' }],
      onUpdate: (m) => { final = [...m] },
    })

    const asst = final.filter((m) => m.role === 'assistant')[0]
    expect(asst.thinkingBlocks).toEqual([{ type: 'thinking', thinking: '', signature: 'sig-1' }])

    const round2Assistant = seen[1].find((m) => m.role === 'assistant') as Extract<Message, { role: 'assistant' }>
    expect(round2Assistant.thinkingBlocks).toEqual([{ type: 'thinking', thinking: '', signature: 'sig-1' }])
  })
})

describe('buildWritePreview — edit_file before-content errors', () => {
  const call = (path: string) => ({ id: 't1', name: 'edit_file', input: { path, content: 'new body' } })

  it('treats a missing file as a legitimately empty before (no warning)', async () => {
    const ctx = makeCtx({ fs: makeMockFs({}) })
    const p = await buildWritePreview(call('notes/new.md') as never, ctx)
    expect(p.kind).toBe('edit')
    if (p.kind !== 'apply_edits') {
      expect(p.diff).toEqual({ before: '', after: 'new body' })
      expect(p.warning).toBeUndefined()
    }
  })

  it('surfaces non-ENOENT read failures as a warning instead of a silent empty diff', async () => {
    const fs = makeMockFs({ 'notes/big.md': { content: 'x', mtimeMs: 1, size: 1, binary: false } })
    fs.readFile = async () => { throw new Error('readFile failed: not-utf8') }
    const ctx = makeCtx({ fs })
    const p = await buildWritePreview(call('notes/big.md') as never, ctx)
    expect(p.kind).toBe('edit')
    if (p.kind !== 'apply_edits') {
      expect(p.warning).toContain('not-utf8')
      expect(p.diff).toEqual({ before: '', after: 'new body' })
    }
  })

  it('reads the open editor buffer for the active document', async () => {
    const ctx = makeCtx({ fs: makeMockFs({}) })
    ctx.activeDocPath = 'notes/open.md'
    ctx.getEditorContent = () => 'editor body'
    const p = await buildWritePreview(call('notes/open.md') as never, ctx)
    if (p.kind !== 'apply_edits') {
      expect(p.diff).toEqual({ before: 'editor body', after: 'new body' })
      expect(p.warning).toBeUndefined()
    }
  })
})
