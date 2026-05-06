import type { LLMAdapter } from './types'
import { anthropicAdapter } from './anthropic'
import { openaiAdapter } from './openai'

export const adapters: Record<string, LLMAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
}

export const adapterList: LLMAdapter[] = Object.values(adapters)

export function getAdapter(id: string): LLMAdapter {
  const a = adapters[id]
  if (!a) throw new Error(`Unknown adapter: ${id}`)
  return a
}

export type { LLMAdapter, CompleteParams, Message } from './types'
