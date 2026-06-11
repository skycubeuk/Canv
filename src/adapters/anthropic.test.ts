import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { anthropicAdapter } from './anthropic'
import { replaySSE } from '../test/sseReplay'

describe('anthropicAdapter.complete (non-streaming)', () => {
  let originalFetch: typeof globalThis.fetch
  beforeEach(() => { originalFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = originalFetch })

  it('returns tokenUsage parsed from data.usage', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      content: [{ type: 'text', text: 'hello' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 12, output_tokens: 5 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch

    const result = await anthropicAdapter.complete({
      apiKey: 'test-key',
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(result.text).toBe('hello')
    expect(result.tokenUsage).toEqual({ input: 12, output: 5 })
  })

  it('omits tokenUsage when the response has no usage field', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      content: [{ type: 'text', text: 'hello' }],
      stop_reason: 'end_turn',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch

    const result = await anthropicAdapter.complete({
      apiKey: 'test-key',
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(result.tokenUsage).toBeUndefined()
  })
})

describe('anthropicAdapter.complete (streaming)', () => {
  let originalFetch: typeof globalThis.fetch
  beforeEach(() => { originalFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = originalFetch })

  it('captures tokenUsage from message_start + message_delta events', async () => {
    const sse = [
      `event: message_start`,
      `data: ${JSON.stringify({ message: { usage: { input_tokens: 7 } } })}`,
      ``,
      `event: content_block_delta`,
      `data: ${JSON.stringify({ delta: { type: 'text_delta', text: 'hi' } })}`,
      ``,
      `event: message_delta`,
      `data: ${JSON.stringify({ delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } })}`,
      ``,
    ].join('\n')

    globalThis.fetch = vi.fn(async () => new Response(sse, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })) as unknown as typeof fetch

    const tokens: string[] = []
    const result = await anthropicAdapter.complete({
      apiKey: 'k',
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'q' }],
      onToken: (chunk) => tokens.push(chunk),
    })

    expect(result.text).toBe('hi')
    expect(tokens).toEqual(['hi'])
    expect(result.tokenUsage).toEqual({ input: 7, output: 3 })
  })
})

function ssEncode(events: Array<{ event: string; data: unknown }>): string {
  return events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('')
}

describe('anthropic — tools', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('passes tools array in request body', async () => {
    let captured: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      captured = init
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: 'ok' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }), { status: 200 })
    }))

    await anthropicAdapter.complete({
      apiKey: 'k', model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ name: 'read_file', description: 'read', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }],
    })

    const body = JSON.parse(String(captured?.body))
    expect(body.tools).toEqual([{
      name: 'read_file',
      description: 'read',
      input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      // The adapter marks the last tool as a prompt-cache breakpoint.
      cache_control: { type: 'ephemeral' },
    }])
  })

  it('parses tool_use blocks from streaming SSE', async () => {
    const events = [
      { event: 'message_start', data: { message: { usage: { input_tokens: 1 } } } },
      { event: 'content_block_start', data: { index: 0, content_block: { type: 'text', text: '' } } },
      { event: 'content_block_delta', data: { index: 0, delta: { type: 'text_delta', text: 'reading…' } } },
      { event: 'content_block_stop', data: { index: 0 } },
      { event: 'content_block_start', data: { index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'read_file', input: {} } } },
      { event: 'content_block_delta', data: { index: 1, delta: { type: 'input_json_delta', partial_json: '{"path":' } } },
      { event: 'content_block_delta', data: { index: 1, delta: { type: 'input_json_delta', partial_json: '"a.md"}' } } },
      { event: 'content_block_stop', data: { index: 1 } },
      { event: 'message_delta', data: { delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } } },
      { event: 'message_stop', data: {} },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(ssEncode(events), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })))

    const tokens: string[] = []
    const out = await anthropicAdapter.complete({
      apiKey: 'k', model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
      onToken: (t) => tokens.push(t),
    })

    expect(tokens).toEqual(['reading…'])
    expect(out.text).toBe('reading…')
    expect(out.stopReason).toBe('tool_use')
    expect(out.toolCalls).toEqual([{ id: 'toolu_1', name: 'read_file', input: { path: 'a.md' } }])
  })
})

describe('anthropic — claude-fable-5', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('lists claude-fable-5 as an available model', () => {
    expect(anthropicAdapter.models).toContain('claude-fable-5')
  })

  it('maps a non-streaming refusal to stopReason="refusal" with stop_details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      content: [],
      stop_reason: 'refusal',
      stop_details: {
        type: 'refusal',
        category: 'cyber',
        explanation: 'This request was declined because it could enable cyber harm.',
      },
      usage: { input_tokens: 412, output_tokens: 0 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    const result = await anthropicAdapter.complete({
      apiKey: 'k',
      model: 'claude-fable-5',
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(result.stopReason).toBe('refusal')
    expect(result.text).toBe('')
    expect(result.refusal).toEqual({
      category: 'cyber',
      explanation: 'This request was declined because it could enable cyber harm.',
    })
  })

  it('maps a streaming refusal from message_delta to stopReason="refusal"', async () => {
    const events = [
      { event: 'message_start', data: { message: { usage: { input_tokens: 9 } } } },
      { event: 'content_block_delta', data: { index: 0, delta: { type: 'text_delta', text: 'partial' } } },
      { event: 'message_delta', data: {
        delta: { stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'bio', explanation: 'Declined.' } },
        usage: { output_tokens: 2 },
      } },
      { event: 'message_stop', data: {} },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(ssEncode(events), {
      status: 200, headers: { 'content-type': 'text/event-stream' },
    })))

    const result = await anthropicAdapter.complete({
      apiKey: 'k', model: 'claude-fable-5',
      messages: [{ role: 'user', content: 'hi' }],
      onToken: () => {},
    })

    expect(result.stopReason).toBe('refusal')
    expect(result.refusal).toEqual({ category: 'bio', explanation: 'Declined.' })
  })

  it('captures thinking blocks verbatim from a non-streaming response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      content: [
        { type: 'thinking', thinking: '', signature: 'sig-1' },
        { type: 'text', text: 'answer' },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 5, output_tokens: 7 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    const result = await anthropicAdapter.complete({
      apiKey: 'k', model: 'claude-fable-5',
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(result.text).toBe('answer')
    expect(result.thinkingBlocks).toEqual([{ type: 'thinking', thinking: '', signature: 'sig-1' }])
  })

  it('assembles streamed thinking blocks (thinking_delta + signature_delta) without leaking into text', async () => {
    const events = [
      { event: 'message_start', data: { message: { usage: { input_tokens: 3 } } } },
      { event: 'content_block_start', data: { index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } } },
      { event: 'content_block_delta', data: { index: 0, delta: { type: 'thinking_delta', thinking: 'reasoning…' } } },
      { event: 'content_block_delta', data: { index: 0, delta: { type: 'signature_delta', signature: 'sig-abc' } } },
      { event: 'content_block_stop', data: { index: 0 } },
      { event: 'content_block_start', data: { index: 1, content_block: { type: 'text', text: '' } } },
      { event: 'content_block_delta', data: { index: 1, delta: { type: 'text_delta', text: 'answer' } } },
      { event: 'content_block_stop', data: { index: 1 } },
      { event: 'message_delta', data: { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 11 } } },
      { event: 'message_stop', data: {} },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(ssEncode(events), {
      status: 200, headers: { 'content-type': 'text/event-stream' },
    })))

    const tokens: string[] = []
    const result = await anthropicAdapter.complete({
      apiKey: 'k', model: 'claude-fable-5',
      messages: [{ role: 'user', content: 'hi' }],
      onToken: (t) => tokens.push(t),
    })

    expect(tokens).toEqual(['answer'])
    expect(result.text).toBe('answer')
    expect(result.thinkingBlocks).toEqual([{ type: 'thinking', thinking: 'reasoning…', signature: 'sig-abc' }])
  })

  it('captures redacted_thinking blocks verbatim from the stream', async () => {
    const events = [
      { event: 'content_block_start', data: { index: 0, content_block: { type: 'redacted_thinking', data: 'opaque-bytes' } } },
      { event: 'content_block_stop', data: { index: 0 } },
      { event: 'content_block_start', data: { index: 1, content_block: { type: 'text', text: '' } } },
      { event: 'content_block_delta', data: { index: 1, delta: { type: 'text_delta', text: 'ok' } } },
      { event: 'content_block_stop', data: { index: 1 } },
      { event: 'message_delta', data: { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } } },
    ]
    vi.stubGlobal('fetch', vi.fn(async () => new Response(ssEncode(events), {
      status: 200, headers: { 'content-type': 'text/event-stream' },
    })))

    const result = await anthropicAdapter.complete({
      apiKey: 'k', model: 'claude-fable-5',
      messages: [{ role: 'user', content: 'hi' }],
      onToken: () => {},
    })

    expect(result.thinkingBlocks).toEqual([{ type: 'redacted_thinking', data: 'opaque-bytes' }])
  })

  it('round-trips stored thinking blocks before text and tool_use in assistant turns', async () => {
    let captured: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      captured = init
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: 'done' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }), { status: 200 })
    }))

    await anthropicAdapter.complete({
      apiKey: 'k', model: 'claude-fable-5',
      messages: [
        { role: 'user', content: 'hi' },
        {
          role: 'assistant', content: 'checking',
          toolCalls: [{ id: 't1', name: 'read_file', input: { path: 'a.md' } }],
          thinkingBlocks: [{ type: 'thinking', thinking: '', signature: 'sig-1' }],
        },
        { role: 'tool', toolResults: [{ id: 't1', content: 'hello' }] },
      ],
    })

    const body = JSON.parse(String(captured?.body))
    expect(body.messages[1].content).toEqual([
      { type: 'thinking', thinking: '', signature: 'sig-1' },
      { type: 'text', text: 'checking' },
      { type: 'tool_use', id: 't1', name: 'read_file', input: { path: 'a.md' } },
    ])
  })

  it('round-trips thinking blocks on assistant turns without tool calls', async () => {
    let captured: RequestInit | undefined
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      captured = init
      return new Response(JSON.stringify({
        content: [{ type: 'text', text: 'done' }],
        stop_reason: 'end_turn',
      }), { status: 200 })
    }))

    await anthropicAdapter.complete({
      apiKey: 'k', model: 'claude-fable-5',
      messages: [
        { role: 'user', content: 'hi' },
        {
          role: 'assistant', content: 'earlier answer',
          thinkingBlocks: [{ type: 'thinking', thinking: '', signature: 'sig-2' }],
        },
        { role: 'user', content: 'follow-up' },
      ],
    })

    const body = JSON.parse(String(captured?.body))
    expect(body.messages[1].content).toEqual([
      { type: 'thinking', thinking: '', signature: 'sig-2' },
      { type: 'text', text: 'earlier answer' },
    ])
  })
})

describe('anthropicAdapter.complete (streaming, cancelled)', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns stopReason="cancelled" with buffered text on mid-stream abort', async () => {
    const events: string[] = []
    events.push(`event: message_start\ndata: ${JSON.stringify({ message: { usage: { input_tokens: 5 } } })}\n\n`)
    for (let i = 0; i < 20; i++) {
      events.push(`event: content_block_delta\ndata: ${JSON.stringify({ index: 0, delta: { type: 'text_delta', text: 'x' } })}\n\n`)
    }
    events.push(`event: message_delta\ndata: ${JSON.stringify({ delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 20 } })}\n\n`)
    const body = events.join('')

    const ac = new AbortController()
    vi.stubGlobal('fetch', vi.fn(async () => replaySSE({ body, controller: ac, abortAfterBytes: 200, chunkSize: 32 })))

    const tokens: string[] = []
    const out = await anthropicAdapter.complete({
      apiKey: 'k', model: 'claude-sonnet-4-6',
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

  it('drops partial tool_use blocks (no content_block_stop) on abort', async () => {
    const head: string[] = []
    head.push(`event: message_start\ndata: ${JSON.stringify({ message: { usage: { input_tokens: 1 } } })}\n\n`)
    head.push(`event: content_block_start\ndata: ${JSON.stringify({ index: 0, content_block: { type: 'text', text: '' } })}\n\n`)
    head.push(`event: content_block_delta\ndata: ${JSON.stringify({ index: 0, delta: { type: 'text_delta', text: 'reading…' } })}\n\n`)
    head.push(`event: content_block_stop\ndata: ${JSON.stringify({ index: 0 })}\n\n`)
    head.push(`event: content_block_start\ndata: ${JSON.stringify({ index: 1, content_block: { type: 'tool_use', id: 'toolu_partial', name: 'read_file', input: {} } })}\n\n`)
    head.push(`event: content_block_delta\ndata: ${JSON.stringify({ index: 1, delta: { type: 'input_json_delta', partial_json: '{"path":' } })}\n\n`)
    const padding = 'event: ping\ndata: {}\n\n'.repeat(40)
    const body = head.join('') + padding

    const ac = new AbortController()
    const announced: Array<{ id: string; name: string }> = []
    vi.stubGlobal('fetch', vi.fn(async () => replaySSE({ body, controller: ac, abortAfterBytes: head.join('').length + 100, chunkSize: 32 })))

    const out = await anthropicAdapter.complete({
      apiKey: 'k', model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
      signal: ac.signal,
      onToken: () => {},
      onToolCallStart: (c) => announced.push(c),
    })

    expect(out.stopReason).toBe('cancelled')
    expect(announced).toEqual([{ id: 'toolu_partial', name: 'read_file' }])
    expect(out.toolCalls).toBeUndefined()
    expect(out.text).toBe('reading…')
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

    const out = await anthropicAdapter.complete({
      apiKey: 'k', model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
      signal: ac.signal,
    })

    expect(out.stopReason).toBe('cancelled')
    expect(out.text).toBe('')
    expect(out.toolCalls).toBeUndefined()
  })
})

describe('anthropicAdapter — slow-mode pacing', () => {
  let originalFetch: typeof globalThis.fetch
  beforeEach(() => { originalFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = originalFetch })

  it('paces onToken invocations to at least chunkDelayMs apart', async () => {
    // 3 text deltas in a single SSE body. With chunkDelayMs=50, deliveries
    // should be spaced ≥45ms (timer-jitter tolerance).
    const sse = [
      'event: message_start',
      'data: {"type":"message_start","message":{"usage":{"input_tokens":10}}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"a"}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"b"}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"c"}}',
      '',
      'event: message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":3}}',
      '',
    ].join('\n')

    globalThis.fetch = vi.fn(async () => new Response(sse, {
      status: 200, headers: { 'Content-Type': 'text/event-stream' },
    })) as unknown as typeof fetch

    const stamps: number[] = []
    const { anthropicAdapter } = await import('./anthropic')
    await anthropicAdapter.complete({
      apiKey: 'k', model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'x' }],
      onToken: () => { stamps.push(performance.now()) },
      chunkDelayMs: 50,
    })

    expect(stamps.length).toBe(3)
    expect(stamps[1] - stamps[0]).toBeGreaterThanOrEqual(45)
    expect(stamps[2] - stamps[1]).toBeGreaterThanOrEqual(45)
  })

  it('chunkDelayMs=0 imposes no measurable pacing', async () => {
    const sse = [
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"a"}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"b"}}',
      '',
      'event: message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}',
      '',
    ].join('\n')
    globalThis.fetch = vi.fn(async () => new Response(sse, {
      status: 200, headers: { 'Content-Type': 'text/event-stream' },
    })) as unknown as typeof fetch

    const stamps: number[] = []
    const { anthropicAdapter } = await import('./anthropic')
    await anthropicAdapter.complete({
      apiKey: 'k', model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'x' }],
      onToken: () => { stamps.push(performance.now()) },
      chunkDelayMs: 0,
    })
    expect(stamps[1] - stamps[0]).toBeLessThan(20)
  })

  it('abort during paced dispatch returns cancelled with buffered text', async () => {
    const ac = new AbortController()
    // Fire abort almost immediately; some dispatches will land before the
    // sleep yields back, producing a clean cancelled return.
    setTimeout(() => ac.abort(), 30)
    const sse = Array.from({ length: 8 }, (_, i) => [
      'event: content_block_delta',
      `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"x${i}"}}`,
      '',
    ].flat()).flat().join('\n')

    globalThis.fetch = vi.fn(async () => new Response(sse, {
      status: 200, headers: { 'Content-Type': 'text/event-stream' },
    })) as unknown as typeof fetch

    const { anthropicAdapter } = await import('./anthropic')
    const result = await anthropicAdapter.complete({
      apiKey: 'k', model: 'claude-sonnet-4-6', messages: [{ role: 'user', content: 'x' }],
      onToken: () => {},
      signal: ac.signal,
      chunkDelayMs: 100,
    })
    expect(result.stopReason).toBe('cancelled')
  })
})

describe('anthropic — prompt caching', () => {
  let originalFetch: typeof globalThis.fetch
  beforeEach(() => { originalFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = originalFetch })

  function captureBody(responseJson: Record<string, unknown>) {
    const calls: Array<Record<string, unknown>> = []
    globalThis.fetch = vi.fn(async (_url, init) => {
      calls.push(JSON.parse((init as RequestInit).body as string))
      return new Response(JSON.stringify(responseJson), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }) as unknown as typeof fetch
    return calls
  }

  const okResponse = {
    content: [{ type: 'text', text: 'ok' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 1, output_tokens: 1 },
  }

  it('adds cache breakpoints to system, last tool, and last message block', async () => {
    const calls = captureBody(okResponse)
    await anthropicAdapter.complete({
      apiKey: 'k',
      model: 'claude-sonnet-4-6',
      system: 'preamble',
      tools: [
        { name: 'a', description: 'A', inputSchema: { type: 'object' } },
        { name: 'b', description: 'B', inputSchema: { type: 'object' } },
      ],
      messages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'reply' },
        { role: 'user', content: 'second' },
      ],
    })

    const body = calls[0]
    const tools = body.tools as Array<Record<string, unknown>>
    expect(tools[0].cache_control).toBeUndefined()
    expect(tools[1].cache_control).toEqual({ type: 'ephemeral' })

    expect(body.system).toEqual([
      { type: 'text', text: 'preamble', cache_control: { type: 'ephemeral' } },
    ])

    const messages = body.messages as Array<{ content: unknown }>
    expect(messages[0].content).toBe('first')
    expect(messages[1].content).toBe('reply')
    expect(messages[2].content).toEqual([
      { type: 'text', text: 'second', cache_control: { type: 'ephemeral' } },
    ])
  })

  it('places the message breakpoint on the last tool_result block in tool loops', async () => {
    const calls = captureBody(okResponse)
    await anthropicAdapter.complete({
      apiKey: 'k',
      model: 'claude-sonnet-4-6',
      messages: [
        { role: 'user', content: 'do it' },
        { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'read_file', input: {} }] },
        { role: 'tool', toolResults: [
          { id: 't1', content: 'body 1' },
          { id: 't2', content: 'body 2' },
        ] },
      ],
    })

    const messages = calls[0].messages as Array<{ content: Array<Record<string, unknown>> }>
    const last = messages[messages.length - 1].content
    expect(last[0].cache_control).toBeUndefined()
    expect(last[1].cache_control).toEqual({ type: 'ephemeral' })
    expect(last[1].tool_use_id).toBe('t2')
  })

  it('never decorates a trailing thinking block', async () => {
    const calls = captureBody(okResponse)
    await anthropicAdapter.complete({
      apiKey: 'k',
      model: 'claude-fable-5',
      messages: [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: '', thinkingBlocks: [{ type: 'thinking', thinking: 'x', signature: 's' }] },
      ],
    })
    const messages = calls[0].messages as Array<{ content: Array<Record<string, unknown>> }>
    const last = messages[messages.length - 1].content
    expect(last[last.length - 1]).toEqual({ type: 'thinking', thinking: 'x', signature: 's' })
  })

  it('parses cache usage fields from a non-streaming response', async () => {
    captureBody({
      ...okResponse,
      usage: { input_tokens: 10, output_tokens: 4, cache_read_input_tokens: 900, cache_creation_input_tokens: 120 },
    })
    const result = await anthropicAdapter.complete({
      apiKey: 'k',
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
    })
    expect(result.tokenUsage).toEqual({ input: 10, output: 4, cacheRead: 900, cacheWrite: 120 })
  })

  it('parses cache usage fields from a streaming response', async () => {
    const sse = [
      `event: message_start`,
      `data: ${JSON.stringify({ message: { usage: { input_tokens: 7, cache_read_input_tokens: 500, cache_creation_input_tokens: 50 } } })}`,
      ``,
      `event: content_block_delta`,
      `data: ${JSON.stringify({ delta: { type: 'text_delta', text: 'hi' } })}`,
      ``,
      `event: message_delta`,
      `data: ${JSON.stringify({ delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } })}`,
      ``,
    ].join('\n')

    globalThis.fetch = vi.fn(async () => new Response(sse, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })) as unknown as typeof fetch

    const result = await anthropicAdapter.complete({
      apiKey: 'k',
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: 'hi' }],
      onToken: () => {},
    })
    expect(result.tokenUsage).toEqual({ input: 7, output: 3, cacheRead: 500, cacheWrite: 50 })
  })
})
