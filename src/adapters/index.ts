import type { LLMAdapter } from './types'
import { anthropicAdapter } from './anthropic'
import { openaiAdapter } from './openai'
import { ollamaAdapter } from './ollama'

export type Provider = 'anthropic' | 'openai' | 'ollama'

export const adapters: Record<Provider, LLMAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  ollama: ollamaAdapter,
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

/**
 * Providers for which the user has supplied credentials — an API key for
 * cloud providers, or a base URL for local Ollama. Used to filter the
 * model/provider pickers down to what the user can actually run.
 *
 * Takes a minimal settings shape rather than the full `Settings` type so
 * this module does not need to import from `hooks/useSettings.ts` (which
 * itself imports from this file).
 */
export function configuredProviders(input: {
  apiKeys: Partial<Record<Provider, string>>
  baseUrls?: { ollama?: string }
}): Provider[] {
  return (Object.keys(adapters) as Provider[]).filter((id) =>
    id === 'ollama'
      ? !!input.baseUrls?.ollama
      : !!input.apiKeys[id],
  )
}

export type { LLMAdapter, CompleteParams, Message } from './types'
