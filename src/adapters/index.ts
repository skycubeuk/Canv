import type { LLMAdapter } from './types'
import { anthropicAdapter } from './anthropic'
import { openaiAdapter } from './openai'

export type Provider = 'anthropic' | 'openai'

export const adapters: Record<Provider, LLMAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
}

export const adapterList: LLMAdapter[] = Object.values(adapters)

export function getAdapter(id: string): LLMAdapter {
  const a = (adapters as Record<string, LLMAdapter>)[id]
  if (!a) throw new Error(`Unknown adapter: ${id}`)
  return a
}

/**
 * Resolve which adapter owns a given model id by scanning each adapter's
 * `models` list. Returns `null` if no adapter claims it — callers should
 * fall back to the user's globally-selected provider in that case.
 *
 * Used by per-agent model overrides so a run can dispatch to (e.g.) OpenAI
 * even when the global provider is Anthropic, as long as both keys are set.
 */
export function providerForModel(model: string): Provider | null {
  for (const [id, adapter] of Object.entries(adapters) as [Provider, LLMAdapter][]) {
    if (adapter.models.includes(model)) return id
  }
  return null
}

/**
 * Display name for a provider id (e.g. `'anthropic'` → `'Anthropic'`). When
 * `id` is unrecognised — most often because a legacy `RunRecord.provider`
 * already stored the human-readable name — return it unchanged so old
 * records still render correctly.
 */
export function providerName(id: string): string {
  return (adapters as Record<string, LLMAdapter>)[id]?.name ?? id
}

export type { LLMAdapter, CompleteParams, Message } from './types'
