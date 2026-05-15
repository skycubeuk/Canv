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
