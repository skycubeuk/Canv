import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { anthropicAdapter } from './anthropic'

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
