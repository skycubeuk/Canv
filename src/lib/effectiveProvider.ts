import { configuredProviders, getAdapter } from '../adapters'
import type { Provider, Settings } from '../hooks/settingsSchema'

/** Resolve the provider+model that "default" actions in the app should use:
 *  the chat seed when opening an empty session, and `canv.ai.ask` calls from
 *  extensions.
 *
 *  Chooses the user's stored default provider if it has credentials;
 *  otherwise falls back to the first provider that does (in a stable order).
 *  The returned model is the user's stored default for that provider,
 *  clamped against the adapter's published model list when one exists —
 *  this prevents stale defaults (e.g. a removed model) from surfacing as
 *  an unreachable pair in the UI.
 *
 *  If nothing is configured at all, returns the user's stored default
 *  unchanged so the UI stays self-consistent (the caller is expected to
 *  surface a clearer "no API key" message at the action site). */
export function pickDefaultProviderModel(settings: Settings): { provider: Provider; model: string } {
  const configured = new Set<Provider>(configuredProviders(settings))
  const provider: Provider = configured.has(settings.provider)
    ? settings.provider
    : ((['anthropic', 'openai', 'ollama'] as Provider[]).find((p) => configured.has(p)) ?? settings.provider)
  const models = provider === 'ollama' ? settings.ollamaModels : (getAdapter(provider).models ?? [])
  const stored = settings.defaultModel[provider]
  const model = models.length === 0
    ? stored
    : (models.includes(stored) ? stored : models[0])
  return { provider, model }
}
