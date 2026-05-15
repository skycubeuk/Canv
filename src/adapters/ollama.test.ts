import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ollamaAdapter } from './ollama'

describe('ollamaAdapter.listModels', () => {
  let originalFetch: typeof globalThis.fetch
  beforeEach(() => { originalFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = originalFetch })

  it('GETs /api/tags and returns the name array', async () => {
    const calls: { url: string }[] = []
    globalThis.fetch = vi.fn(async (url: unknown) => {
      calls.push({ url: String(url) })
      return new Response(JSON.stringify({
        models: [
          { name: 'llama3.1:8b', size: 1, modified_at: '' },
          { name: 'qwen2.5:7b', size: 1, modified_at: '' },
        ],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as unknown as typeof fetch

    const names = await ollamaAdapter.listModels!('http://localhost:11434')

    expect(names).toEqual(['llama3.1:8b', 'qwen2.5:7b'])
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('http://localhost:11434/api/tags')
  })

  it('throws a formatted error on non-2xx', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('nope', { status: 500, statusText: 'Server Error' }),
    ) as unknown as typeof fetch

    await expect(ollamaAdapter.listModels!('http://localhost:11434'))
      .rejects.toThrow(/Ollama 500/)
  })
})

describe('ollamaAdapter.complete (non-streaming)', () => {
  let originalFetch: typeof globalThis.fetch
  beforeEach(() => { originalFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = originalFetch })

  it('POSTs /api/chat and returns text + tokenUsage', async () => {
    const calls: { url: string; body: string }[] = []
    globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      calls.push({ url: String(url), body: typeof init?.body === 'string' ? init.body : '' })
      return new Response(JSON.stringify({
        model: 'llama3.1',
        message: { role: 'assistant', content: 'hello world' },
        done: true,
        done_reason: 'stop',
        prompt_eval_count: 12,
        eval_count: 5,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as unknown as typeof fetch

    const result = await ollamaAdapter.complete({
      apiKey: '',
      baseUrl: 'http://localhost:11434',
      model: 'llama3.1',
      messages: [{ role: 'user', content: 'hi' }],
      maxTokens: 256,
    })

    expect(result.text).toBe('hello world')
    expect(result.tokenUsage).toEqual({ input: 12, output: 5 })
    expect(result.stopReason).toBe('end_turn')
    expect(result.truncated).toBe(false)

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('http://localhost:11434/api/chat')
    const sent = JSON.parse(calls[0].body)
    expect(sent.model).toBe('llama3.1')
    expect(sent.stream).toBe(false)
    expect(sent.options).toEqual({ num_predict: 256 })
    expect(sent.messages).toEqual([{ role: 'user', content: 'hi' }])
  })

  it('maps done_reason: "length" → stopReason "max_tokens" with truncated true', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      message: { role: 'assistant', content: 'partial' },
      done: true,
      done_reason: 'length',
      prompt_eval_count: 3,
      eval_count: 1,
    }), { status: 200 })) as unknown as typeof fetch

    const result = await ollamaAdapter.complete({
      apiKey: '',
      baseUrl: 'http://localhost:11434',
      model: 'llama3.1',
      messages: [{ role: 'user', content: 'q' }],
    })

    expect(result.stopReason).toBe('max_tokens')
    expect(result.truncated).toBe(true)
  })

  it('prepends a system message when system is provided', async () => {
    let captured = ''
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      captured = typeof init?.body === 'string' ? init.body : ''
      return new Response(JSON.stringify({
        message: { role: 'assistant', content: 'ok' },
        done: true, done_reason: 'stop', prompt_eval_count: 1, eval_count: 1,
      }), { status: 200 })
    }) as unknown as typeof fetch

    await ollamaAdapter.complete({
      apiKey: '',
      baseUrl: 'http://localhost:11434',
      model: 'llama3.1',
      system: 'You are concise.',
      messages: [{ role: 'user', content: 'hi' }],
    })

    const sent = JSON.parse(captured)
    expect(sent.messages[0]).toEqual({ role: 'system', content: 'You are concise.' })
    expect(sent.messages[1]).toEqual({ role: 'user', content: 'hi' })
  })

  it('throws Ollama-prefixed error on non-2xx', async () => {
    globalThis.fetch = vi.fn(async () => new Response('model not found', { status: 404 })) as unknown as typeof fetch
    await expect(ollamaAdapter.complete({
      apiKey: '', baseUrl: 'http://localhost:11434',
      model: 'mystery', messages: [{ role: 'user', content: 'q' }],
    })).rejects.toThrow(/Ollama 404/)
  })

  it('rejects when baseUrl is missing', async () => {
    await expect(ollamaAdapter.complete({
      apiKey: '', model: 'llama3.1', messages: [{ role: 'user', content: 'q' }],
    })).rejects.toThrow(/baseUrl/)
  })
})

describe('ollamaAdapter.complete — tool calls (non-streaming)', () => {
  let originalFetch: typeof globalThis.fetch
  beforeEach(() => { originalFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = originalFetch })

  it('passes tools array as OpenAI-shape functions in body', async () => {
    let captured = ''
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      captured = typeof init?.body === 'string' ? init.body : ''
      return new Response(JSON.stringify({
        message: { role: 'assistant', content: 'ok' },
        done: true, done_reason: 'stop', prompt_eval_count: 1, eval_count: 1,
      }), { status: 200 })
    }) as unknown as typeof fetch

    await ollamaAdapter.complete({
      apiKey: '', baseUrl: 'http://localhost:11434',
      model: 'llama3.1',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{
        name: 'read_file',
        description: 'Read a file',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      }],
    })

    const sent = JSON.parse(captured)
    expect(sent.tools).toEqual([{
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read a file',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      },
    }])
  })

  it('parses tool_calls from the response (arguments as object)', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [
          { function: { name: 'read_file', arguments: { path: '/tmp/a' } } },
          { function: { name: 'write_file', arguments: { path: '/tmp/b', text: 'hi' } } },
        ],
      },
      done: true, done_reason: 'stop', prompt_eval_count: 4, eval_count: 2,
    }), { status: 200 })) as unknown as typeof fetch

    const result = await ollamaAdapter.complete({
      apiKey: '', baseUrl: 'http://localhost:11434',
      model: 'llama3.1', messages: [{ role: 'user', content: 'go' }],
    })

    expect(result.stopReason).toBe('tool_use')
    expect(result.toolCalls).toEqual([
      { id: 'ollama_tc_0', name: 'read_file', input: { path: '/tmp/a' } },
      { id: 'ollama_tc_1', name: 'write_file', input: { path: '/tmp/b', text: 'hi' } },
    ])
  })

  it('parses tool_calls when arguments arrive as a JSON string (compat path)', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      message: {
        role: 'assistant', content: '',
        tool_calls: [{ function: { name: 'read_file', arguments: '{"path":"/tmp/x"}' } }],
      },
      done: true, done_reason: 'stop', prompt_eval_count: 1, eval_count: 1,
    }), { status: 200 })) as unknown as typeof fetch

    const result = await ollamaAdapter.complete({
      apiKey: '', baseUrl: 'http://localhost:11434',
      model: 'llama3.1', messages: [{ role: 'user', content: 'go' }],
    })

    expect(result.toolCalls).toEqual([
      { id: 'ollama_tc_0', name: 'read_file', input: { path: '/tmp/x' } },
    ])
  })
})

function ndjsonResponse(lines: unknown[]): Response {
  const body = lines.map((l) => JSON.stringify(l)).join('\n') + '\n'
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })
}

describe('ollamaAdapter.complete (streaming)', () => {
  let originalFetch: typeof globalThis.fetch
  beforeEach(() => { originalFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = originalFetch })

  it('streams text via onToken and parses usage from the final done:true line', async () => {
    globalThis.fetch = vi.fn(async () => ndjsonResponse([
      { message: { role: 'assistant', content: 'hello ' }, done: false },
      { message: { role: 'assistant', content: 'world' },  done: false },
      { message: { role: 'assistant', content: '' }, done: true,
        done_reason: 'stop', prompt_eval_count: 7, eval_count: 3 },
    ])) as unknown as typeof fetch

    const tokens: string[] = []
    const result = await ollamaAdapter.complete({
      apiKey: '', baseUrl: 'http://localhost:11434',
      model: 'llama3.1', messages: [{ role: 'user', content: 'q' }],
      onToken: (c) => tokens.push(c),
    })

    expect(tokens).toEqual(['hello ', 'world'])
    expect(result.text).toBe('hello world')
    expect(result.tokenUsage).toEqual({ input: 7, output: 3 })
    expect(result.stopReason).toBe('end_turn')
  })

  it('sets stream:true in the request body when onToken is provided', async () => {
    let captured = ''
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      captured = typeof init?.body === 'string' ? init.body : ''
      return ndjsonResponse([
        { message: { role: 'assistant', content: 'ok' }, done: false },
        { message: { role: 'assistant', content: '' }, done: true,
          done_reason: 'stop', prompt_eval_count: 1, eval_count: 1 },
      ])
    }) as unknown as typeof fetch

    await ollamaAdapter.complete({
      apiKey: '', baseUrl: 'http://localhost:11434',
      model: 'llama3.1', messages: [{ role: 'user', content: 'q' }],
      onToken: () => {},
    })
    expect(JSON.parse(captured).stream).toBe(true)
  })
})

describe('ollamaAdapter.complete — tool calls (streaming)', () => {
  let originalFetch: typeof globalThis.fetch
  beforeEach(() => { originalFetch = globalThis.fetch })
  afterEach(() => { globalThis.fetch = originalFetch })

  it('emits onToolCallStart and returns toolCalls from the final NDJSON line', async () => {
    globalThis.fetch = vi.fn(async () => ndjsonResponse([
      { message: { role: 'assistant', content: 'thinking…' }, done: false },
      {
        message: {
          role: 'assistant', content: '',
          tool_calls: [{ function: { name: 'read_file', arguments: { path: '/tmp/x' } } }],
        },
        done: true, done_reason: 'stop', prompt_eval_count: 5, eval_count: 1,
      },
    ])) as unknown as typeof fetch

    const tokens: string[] = []
    const started: Array<{ id: string; name: string }> = []
    const result = await ollamaAdapter.complete({
      apiKey: '', baseUrl: 'http://localhost:11434',
      model: 'llama3.1', messages: [{ role: 'user', content: 'go' }],
      onToken: (c) => tokens.push(c),
      onToolCallStart: (call) => started.push(call),
    })

    expect(tokens).toEqual(['thinking…'])
    expect(started).toEqual([{ id: 'ollama_tc_0', name: 'read_file' }])
    expect(result.text).toBe('thinking…')
    expect(result.stopReason).toBe('tool_use')
    expect(result.toolCalls).toEqual([
      { id: 'ollama_tc_0', name: 'read_file', input: { path: '/tmp/x' } },
    ])
    expect(result.tokenUsage).toEqual({ input: 5, output: 1 })
  })
})
