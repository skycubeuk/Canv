import { useCallback, useMemo } from 'react'
import { useLocalStorage } from './useLocalStorage'
import type { Mode } from '../config/types'
import { adapters, providerForModel } from '../adapters'
import type { Provider } from '../adapters'
import type { ModelPricing } from '../config/pricing'
import { DEFAULT_ACCENT } from '../lib/accent'

const ALLOWED_DELAYS = [0, 50, 100, 200] as const
export type StreamChunkDelayMs = (typeof ALLOWED_DELAYS)[number]

export type { Provider }

/**
 * Per-action model overrides store the provider explicitly so a future
 * adapter that lists the same model id (e.g. AWS Bedrock exposing a Claude
 * model name already used by the direct Anthropic adapter) can be selected
 * unambiguously. Older storage held just the model string; the merge step
 * upgrades those values via providerForModel.
 */
export interface AgentModelRef {
  provider: Provider
  model: string
}
export type Theme = 'light' | 'dark' | 'system'
export type LineWidth = 'narrow' | 'normal' | 'wide'

export interface Settings {
  provider: Provider
  apiKeys: Record<Provider, string>
  defaultModel: Record<Provider, string>
  useDefaultModelForAll: boolean
  perAgentModel: Record<string, Record<string, AgentModelRef>>
  fontSize: number
  /** Base font size (px) for the chat panel. Bubbles use 1em; smaller chrome
   *  scales proportionally. Independent of the editor's `fontSize` so writing
   *  density and chat-reading density can be tuned separately. */
  chatFontSize: number
  lineWidth: LineWidth
  theme: Theme
  streaming: boolean
  maxOutputTokens: Record<Provider, number>
  chatToolBudget: number
  pricingOverrides: Record<string, ModelPricing>
  streamChunkDelayMs: StreamChunkDelayMs
  autoScroll: boolean
  lintRules: {
    brokenLinks: boolean
    frontMatter: boolean
    headingSkip: boolean
    deadImages: boolean
  }
  accent: string
}

const SETTINGS_KEY = 'canv:settings'

const DEFAULT_SETTINGS: Settings = {
  provider: 'anthropic',
  apiKeys: { anthropic: '', openai: '' },
  defaultModel: { anthropic: 'claude-sonnet-4-6', openai: 'gpt-5.5' },
  useDefaultModelForAll: true,
  perAgentModel: {},
  fontSize: 16,
  chatFontSize: 14,
  lineWidth: 'normal',
  theme: 'system',
  streaming: true,
  maxOutputTokens: { anthropic: 8192, openai: 8192 },
  chatToolBudget: 10,
  pricingOverrides: {},
  streamChunkDelayMs: 0,
  autoScroll: true,
  lintRules: {
    brokenLinks: true,
    frontMatter: true,
    headingSkip: true,
    deadImages: true,
  },
  accent: DEFAULT_ACCENT,
}

function purgeLegacyOnce() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object') return
    let changed = false
    if ('prompts' in parsed) { delete parsed.prompts; changed = true }
    if ('promptOverrides' in parsed) { delete parsed.promptOverrides; changed = true }
    // perAgentModel was previously flat (Record<actionId, model>); if any value
    // is a string, the map is flat — drop it so it gets re-seeded as nested.
    if (parsed.perAgentModel && typeof parsed.perAgentModel === 'object') {
      const m = parsed.perAgentModel as Record<string, unknown>
      const flat = Object.values(m).some((v) => typeof v === 'string')
      if (flat) { parsed.perAgentModel = {}; changed = true }
    }
    if (changed) localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed))
  } catch { /* ignore */ }
}

purgeLegacyOnce()

export function useSettings() {
  const [settings, setSettings] = useLocalStorage<Settings>(SETTINGS_KEY, DEFAULT_SETTINGS)

  // Build the fully-defaulted settings once per stored-settings change. Without
  // useMemo, every consumer render returned a new `merged` (and a new
  // `merged.lintRules`, etc.), which fed unstable refs into downstream hooks
  // like useLintIssues and triggered a render loop via its 300ms debounce.
  const merged: Settings = useMemo(() => {
    const m: Settings = {
      ...DEFAULT_SETTINGS,
      ...settings,
      apiKeys: { ...DEFAULT_SETTINGS.apiKeys, ...(settings?.apiKeys || {}) },
      defaultModel: { ...DEFAULT_SETTINGS.defaultModel, ...(settings?.defaultModel || {}) },
      perAgentModel: { ...DEFAULT_SETTINGS.perAgentModel, ...(settings?.perAgentModel || {}) },
      maxOutputTokens: { ...DEFAULT_SETTINGS.maxOutputTokens, ...(settings?.maxOutputTokens || {}) },
      lintRules: { ...DEFAULT_SETTINGS.lintRules, ...(settings?.lintRules || {}) },
      pricingOverrides: { ...DEFAULT_SETTINGS.pricingOverrides, ...(settings?.pricingOverrides || {}) },
    }
    for (const provider of Object.keys(m.defaultModel) as Provider[]) {
      const available = adapters[provider]?.models ?? []
      if (!available.includes(m.defaultModel[provider])) {
        m.defaultModel[provider] = DEFAULT_SETTINGS.defaultModel[provider]
      }
    }
    // Clamp out-of-range streamChunkDelayMs from older builds or hand-edited storage.
    if (!(ALLOWED_DELAYS as readonly number[]).includes(m.streamChunkDelayMs)) {
      m.streamChunkDelayMs = 0
    }
    // Clamp chatFontSize to the slider range; default if nonsense.
    if (!Number.isFinite(m.chatFontSize)) m.chatFontSize = DEFAULT_SETTINGS.chatFontSize
    else m.chatFontSize = Math.min(22, Math.max(12, Math.round(m.chatFontSize)))
    // pricingOverrides: drop entries whose values are not finite numbers.
    // Also upgrade legacy bare-model-id keys to `${provider}/${model}` so two
    // adapters listing the same model id can carry independent overrides.
    const cleaned: Record<string, ModelPricing> = {}
    for (const [k, v] of Object.entries(m.pricingOverrides)) {
      if (!v || !Number.isFinite(v.input) || !Number.isFinite(v.output)) continue
      if (k.includes('/')) {
        cleaned[k] = v
        continue
      }
      const ownedBy = providerForModel(k)
      if (ownedBy) {
        cleaned[`${ownedBy}/${k}`] = v
      }
      // No adapter claims this bare model id — drop. Legacy entries for
      // models that no longer exist were never resolvable anyway.
    }
    m.pricingOverrides = cleaned
    // Normalize per-action overrides. Old storage held a bare model-id
    // string per action; new storage holds { provider, model }. Upgrade
    // bare strings via providerForModel; replace anything that no adapter
    // claims with the user's current default ref so the action stays linked.
    const fallbackRef: AgentModelRef = {
      provider: m.provider,
      model: m.defaultModel[m.provider],
    }
    const allKnownModels = new Set(Object.values(adapters).flatMap((a) => a.models))
    for (const modeId of Object.keys(m.perAgentModel)) {
      const inner = m.perAgentModel[modeId] as unknown as Record<string, AgentModelRef | string>
      for (const actionId of Object.keys(inner)) {
        const v = inner[actionId]
        if (typeof v === 'string') {
          const provider = providerForModel(v)
          if (provider) {
            inner[actionId] = { provider, model: v }
          } else {
            inner[actionId] = fallbackRef
          }
        } else if (v && typeof v === 'object' && 'provider' in v && 'model' in v) {
          // Validate the composite still resolves to an extant model.
          if (!allKnownModels.has(v.model)) inner[actionId] = fallbackRef
        } else {
          inner[actionId] = fallbackRef
        }
      }
    }
    return m
  }, [settings])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [setSettings])

  const modelForAgent = useCallback((modeId: string, agentId: string): AgentModelRef => {
    const fallback: AgentModelRef = {
      provider: merged.provider,
      model: merged.defaultModel[merged.provider],
    }
    if (merged.useDefaultModelForAll) return fallback
    return merged.perAgentModel[modeId]?.[agentId] ?? fallback
  }, [merged])

  const getActionPrompt = useCallback((mode: Mode, actionId: string): string => {
    const action = mode.actions.find((a) => a.id === actionId)
    if (!action) throw new Error(`Unknown action: ${actionId} in mode ${mode.id}`)
    return action.prompt
  }, [])

  return useMemo(() => ({
    settings: merged,
    update,
    getActionPrompt,
    modelForAgent,
  }), [merged, update, getActionPrompt, modelForAgent])
}
