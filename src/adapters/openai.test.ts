import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { openaiAdapter } from './openai'
import { replaySSE } from '../test/sseReplay'

function dataLines(events: unknown[]): string {
  return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'data: [DONE]\n\n'
}

describe('openaiAdapter.complete (non-streaming)', () => {
  let originalFetch: typeof globalThis.fetch
  beforeEach(() => { originalFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = originalFetch })

  it('returns tokenUsage from data.usage.prompt_tokens / completion_tokens', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 4 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch

    const result = await openaiAdapter.complete({
      apiKey: 'k', model: 'gpt-5.5', messages: [{ role: 'user', content: 'hi' }],
    })

    expect(result.text).toBe('hello')
    expect(result.tokenUsage).toEqual({ input: 10, output: 4 })
  })

  it('omits tokenUsage when the response has no usage field', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch

    const result = await openaiAdapter.complete({
      apiKey: 'k', model: 'gpt-5.5', messages: [{ role: 'user', content: 'hi' }],
    })

    expect(result.tokenUsage).toBeUndefined()
  })
})

describe('openaiAdapter.complete (streaming)', () => {
  let originalFetch: typeof globalThis.fetch
  beforeEach(() => { originalFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = originalFetch })

  it('sends stream_options.include_usage and parses usage from the final chunk', async () => {
    const calls: { body: string }[] = []
    const sse = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'hi' }, finish_reason: null }] })}`,
      ``,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 6, completion_tokens: 2 } })}`,
      ``,
      `data: [DONE]`,
      ``,
    ].join('\n')

    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      calls.push({ body: typeof init?.body === 'string' ? init.body : '' })
      return new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    }) as unknown as typeof fetch

    const tokens: string[] = []
    const result = await openaiAdapter.complete({
      apiKey: 'k', model: 'gpt-5.5', messages: [{ role: 'user', content: 'q' }],
      onToken: (c) => tokens.push(c),
    })

    expect(tokens).toEqual(['hi'])
    expect(result.text).toBe('hi')
    expect(result.tokenUsage).toEqual({ input: 6, output: 2 })

    // Verify the request body opted in
    expect(calls).toHaveLength(1)
    const sent = JSON.parse(calls[0].body)
    expect(sent.stream).toBe(true)
    expect(sent.stream_options).toEqual({ include_usage: true })
  })
})

describe('openai — tools', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('passes tools array as functions in request body', async () => {
    let captured: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => {
      captured = init
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }), { status: 200 })
    }))

    await openaiAdapter.complete({
      apiKey: 'k', model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 'read_file', description: 'read', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }],
    })

    const body = JSON.parse(String(captured?.body))
    expect(body.tools).toEqual([{
      type: 'function',
      function: {
        name: 'read_file',
        description: 'read',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      },
    }])
  })

  it('parses tool_calls deltas from streaming SSE', async () => {
    const events = [
      { choices: [{ index: 0, delta: { content: 'reading…' } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '' } }] } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"path":' } }] } }] },
      { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '"a.md"}' } }] } }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1, completion_tokens: 5 } },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(dataLines(events), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })))

    const tokens: string[] = []
    const out = await openaiAdapter.complete({
      apiKey: 'k', model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'hi' }],
      onToken: (t) => tokens.push(t),
    })

    expect(tokens).toEqual(['reading…'])
    expect(out.text).toBe('reading…')
    expect(out.stopReason).toBe('tool_use')
    expect(out.toolCalls).toEqual([{ id: 'call_1', name: 'read_file', input: { path: 'a.md' } }])
  })

  it('translates tool messages and assistant.tool_calls history correctly', async () => {
    let captured: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init: RequestInit) => {
      captured = init
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'done' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }), { status: 200 })
    }))

    await openaiAdapter.complete({
      apiKey: 'k', model: 'gpt-5.5',
      messages: [
        { role: 'user', content: 'read a.md' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'read_file', input: { path: 'a.md' } }] },
        { role: 'tool', toolResults: [{ id: 'call_1', content: '{"content":"hi","mtimeMs":1}' }] },
      ],
    })

    const body = JSON.parse(String(captured?.body))
    expect(body.messages).toEqual([
      { role: 'user', content: 'read a.md' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.md"}' } }] },
      { role: 'tool', tool_call_id: 'call_1', content: '{"content":"hi","mtimeMs":1}' },
    ])
  })
})

describe('openaiAdapter.complete (streaming, cancelled)', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns stopReason="cancelled" with buffered text on mid-stream abort', async () => {
    const lines: string[] = []
    for (let i = 0; i < 20; i++) {
      lines.push(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'x' } }] })}\n\n`)
    }
    lines.push(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 20 } })}\n\n`)
    lines.push(`data: [DONE]\n\n`)
    const body = lines.join('')

    const ac = new AbortController()
    vi.stubGlobal('fetch', vi.fn(async () => replaySSE({ body, controller: ac, abortAfterBytes: 150, chunkSize: 32 })))

    const tokens: string[] = []
    const out = await openaiAdapter.complete({
      apiKey: 'k', model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'hi' }],
      signal: ac.signal,
      onToken: (t) => tokens.push(t),
    })

    expect(out.stopReason).toBe('cancelled')
    expect(out.truncated).toBe(false)
    expect(out.text.length).toBeGreaterThan(0)
    expect(out.text.length).toBeLessThan(20)
    expect(out.text).toBe(tokens.join(''))
    expect(out.toolCalls).toBeUndefined()
  })

  it('drops partial tool_calls (unparseable arguments) on abort', async () => {
    const head: string[] = []
    head.push(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'reading…' } }] })}\n\n`)
    head.push(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_partial', type: 'function', function: { name: 'read_file', arguments: '' } }] } }] })}\n\n`)
    head.push(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"path":' } }] } }] })}\n\n`)
    const padding = `data: ${JSON.stringify({ choices: [{ index: 0, delta: {} }] })}\n\n`.repeat(40)
    const body = head.join('') + padding

    const ac = new AbortController()
    vi.stubGlobal('fetch', vi.fn(async () => replaySSE({ body, controller: ac, abortAfterBytes: head.join('').length + 80, chunkSize: 32 })))

    const out = await openaiAdapter.complete({
      apiKey: 'k', model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'hi' }],
      signal: ac.signal,
      onToken: () => {},
    })

    expect(out.stopReason).toBe('cancelled')
    expect(out.text).toBe('reading…')
    expect(out.toolCalls).toBeUndefined()
  })

  it('returns cancelled from non-streaming complete when fetch aborts', async () => {
    const ac = new AbortController()
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: RequestInit) => {
      return new Promise((_, reject) => {
        const sig = init?.signal as AbortSignal | undefined
        sig?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
        if (sig?.aborted) reject(new DOMException('aborted', 'AbortError'))
      })
    }))

    setTimeout(() => ac.abort(), 0)

    const out = await openaiAdapter.complete({
      apiKey: 'k', model: 'gpt-5.5',
      messages: [{ role: 'user', content: 'hi' }],
      signal: ac.signal,
    })

    expect(out.stopReason).toBe('cancelled')
    expect(out.text).toBe('')
    expect(out.toolCalls).toBeUndefined()
  })
})
