import { useCallback, useMemo } from 'react'
import { useLocalStorage } from './useLocalStorage'
import type { Mode } from '../config/types'
import { adapters } from '../adapters'

export type Provider = 'anthropic' | 'openai'
export type Theme = 'light' | 'dark' | 'system'
export type LineWidth = 'narrow' | 'normal' | 'wide'

export interface Settings {
  provider: Provider
  apiKeys: Record<Provider, string>
  defaultModel: Record<Provider, string>
  useDefaultModelForAll: boolean
  perAgentModel: Record<string, Record<string, string>>
  fontSize: number
  lineWidth: LineWidth
  theme: Theme
  streaming: boolean
  maxOutputTokens: Record<Provider, number>
  chatToolBudget: number
  lintRules: {
    brokenLinks: boolean
    frontMatter: boolean
    headingSkip: boolean
    deadImages: boolean
  }
}

const SETTINGS_KEY = 'canv:settings'

const DEFAULT_SETTINGS: Settings = {
  provider: 'anthropic',
  apiKeys: { anthropic: '', openai: '' },
  defaultModel: { anthropic: 'claude-sonnet-4-6', openai: 'gpt-5.5' },
  useDefaultModelForAll: true,
  perAgentModel: {},
  fontSize: 16,
  lineWidth: 'normal',
  theme: 'system',
  streaming: true,
  maxOutputTokens: { anthropic: 8192, openai: 8192 },
  chatToolBudget: 10,
  lintRules: {
    brokenLinks: true,
    frontMatter: true,
    headingSkip: true,
    deadImages: true,
  },
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
    }
    for (const provider of Object.keys(m.defaultModel) as Provider[]) {
      const available = adapters[provider]?.models ?? []
      if (!available.includes(m.defaultModel[provider])) {
        m.defaultModel[provider] = DEFAULT_SETTINGS.defaultModel[provider]
      }
    }
    const allKnownModels = new Set(Object.values(adapters).flatMap((a) => a.models))
    const fallbackModel = m.defaultModel[m.provider]
    for (const modeId of Object.keys(m.perAgentModel)) {
      const inner = m.perAgentModel[modeId]
      for (const actionId of Object.keys(inner)) {
        if (!allKnownModels.has(inner[actionId])) {
          inner[actionId] = fallbackModel
        }
      }
    }
    return m
  }, [settings])

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [setSettings])

  const modelForAgent = useCallback((modeId: string, agentId: string): string => {
    if (merged.useDefaultModelForAll) return merged.defaultModel[merged.provider]
    return merged.perAgentModel[modeId]?.[agentId] || merged.defaultModel[merged.provider]
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
