import type { LLMAdapter, CompleteParams, CompleteResult } from './types'

export const ollamaAdapter: LLMAdapter = {
  id: 'ollama',
  name: 'Ollama',
  // Seed list. Replaced at runtime by listModels() when the user refreshes.
  models: ['llama3.1', 'qwen2.5', 'mistral'],

  async listModels(_baseUrl: string, _signal?: AbortSignal): Promise<string[]> {
    throw new Error('ollamaAdapter.listModels: not implemented yet')
  },

  async complete(_params: CompleteParams): Promise<CompleteResult> {
    throw new Error('ollamaAdapter.complete: not implemented yet')
  },
}
