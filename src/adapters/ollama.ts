import type { LLMAdapter, CompleteParams, CompleteResult } from './types'

function stripTrailingSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s
}

export const ollamaAdapter: LLMAdapter = {
  id: 'ollama',
  name: 'Ollama',
  // Seed list. Replaced at runtime by listModels() when the user refreshes.
  models: ['llama3.1', 'qwen2.5', 'mistral'],

  async listModels(baseUrl: string, signal?: AbortSignal): Promise<string[]> {
    const url = `${stripTrailingSlash(baseUrl)}/api/tags`
    const res = await fetch(url, { signal })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Ollama ${res.status}: ${body || res.statusText}`)
    }
    const data = await res.json() as { models?: Array<{ name?: string }> }
    return (data.models ?? [])
      .map((m) => m.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0)
  },

  async complete(_params: CompleteParams): Promise<CompleteResult> {
    throw new Error('ollamaAdapter.complete: not implemented yet')
  },
}
