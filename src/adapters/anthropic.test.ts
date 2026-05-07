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
