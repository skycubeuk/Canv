import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useLocalStorage } from './useLocalStorage'
import type { Mode } from '../config/types'
import { adapters, providerForModel } from '../adapters'
import {
  SettingsSchema,
  type Settings,
  type AgentModelRef,
  type McpServerConfig,
  type Provider,
  type Theme,
  type LineWidth,
  type StreamChunkDelayMs,
  type ModelPricing,
} from './settingsSchema'
import { salvage } from '../lib/zodSalvage'

export type { Settings, AgentModelRef, McpServerConfig, Provider, Theme, LineWidth, StreamChunkDelayMs }

const SETTINGS_KEY = 'canv:settings'

/** Post-salvage normalisation that depends on React/adapter data.
 *  Mirrors the runtime-data-dependent passes the old hand-coded `merged`
 *  builder used to do: legacy perAgentModel upgrade, bare-key pricing
 *  override re-keying, defaultModel clamp against live adapter models. */
type SettingsLoose = Omit<Settings, 'perAgentModel' | 'pricingOverrides' | 'mcpServers'> & {
  perAgentModel: Record<string, Record<string, unknown>>
  pricingOverrides: Record<string, unknown>
  mcpServers: unknown[]
}

function postProcess(s: SettingsLoose): Settings {
  // Shallow clone so the caller's input stays referentially stable across renders.
  const out: Settings = {
    ...s,
    pricingOverrides: {},
    perAgentModel: {},
    mcpServers: [],
  }

  // mcpServers: storage shape is z.array(z.unknown()) so a partially-typed
  // in-progress row (e.g. an empty new entry the user just added via the
  // auto-gen UI) doesn't fail the whole-array parse and wipe valid siblings.
  // We pass entries through untouched here — the editor needs to see the
  // in-progress shape so the user can complete it. Downstream consumers
  // (the MCP service in electron/services/mcp/index.cjs) filter at their
  // boundary by safeParse-ing against McpServerConfigSchema before
  // attempting to connect. Items that don't validate are silently ignored
  // there and never reach the subprocess spawn.
  out.mcpServers = s.mcpServers as McpServerConfig[]

  // Re-key pricingOverrides bare keys -> provider/model. Drop unresolvable
  // bare keys and any entry whose numbers are non-finite.
  const cleanedPricing: Record<string, ModelPricing> = {}
  for (const [k, rawV] of Object.entries(s.pricingOverrides)) {
    if (!rawV || typeof rawV !== 'object') continue
    const v = rawV as { input?: unknown; output?: unknown }
    if (typeof v.input !== 'number' || !Number.isFinite(v.input)) continue
    if (typeof v.output !== 'number' || !Number.isFinite(v.output)) continue
    const entry: ModelPricing = { input: v.input, output: v.output }
    if (k.includes('/')) { cleanedPricing[k] = entry; continue }
    const ownedBy = providerForModel(k)
    if (ownedBy) cleanedPricing[`${ownedBy}/${k}`] = entry
  }
  out.pricingOverrides = cleanedPricing

  // perAgentModel: upgrade legacy string entries; replace unresolved with the
  // user's current default ref so the action stays linked.
  const modelsForProvider = (p: Provider): string[] =>
    p === 'ollama' ? out.ollamaModels : (adapters[p]?.models ?? [])
  const fallback: AgentModelRef = {
    provider: out.provider,
    model: out.defaultModel[out.provider] ?? '',
  }
  const upgraded: Record<string, Record<string, AgentModelRef>> = {}
  for (const [modeId, innerRaw] of Object.entries(s.perAgentModel)) {
    if (!innerRaw || typeof innerRaw !== 'object') continue
    const innerOut: Record<string, AgentModelRef> = {}
    const inner = innerRaw as Record<string, unknown>
    for (const [actionId, v] of Object.entries(inner)) {
      if (typeof v === 'string') {
        const p = providerForModel(v)
        innerOut[actionId] = p ? { provider: p, model: v } : fallback
      } else if (v && typeof v === 'object' && 'provider' in v && 'model' in v) {
        const ref = v as AgentModelRef
        innerOut[actionId] = modelsForProvider(ref.provider).includes(ref.model) ? ref : fallback
      } else {
        innerOut[actionId] = fallback
      }
    }
    upgraded[modeId] = innerOut
  }
  out.perAgentModel = upgraded

  // Clamp defaultModel[provider] against live models (Ollama uses the refreshed
  // ollamaModels cache, not the static adapter seed).
  const dm: Record<string, string> = { ...out.defaultModel }
  for (const p of Object.keys(dm) as Provider[]) {
    const avail = modelsForProvider(p)
    if (avail.length > 0 && !avail.includes(dm[p])) {
      dm[p] = avail[0]
    }
  }
  out.defaultModel = dm as Settings['defaultModel']

  return out
}

export interface UseSettingsOptions {
  /** Called once on first mount if salvage dropped any fields. Wired by
   *  ServicesProvider to `notifications.showToast` so the boot warning surfaces
   *  in the canonical toast UI. */
  onDropped?: (dropped: string[]) => void
}

export function useSettings(opts: UseSettingsOptions = {}) {
  const [raw, setRaw] = useLocalStorage<Settings>(SETTINGS_KEY, {} as Settings)

  // Single salvage + postProcess per change of raw. useMemo so consumers don't
  // get a fresh `settings` identity per render (the same render-loop concern
  // the original file documented for `merged`).
  const { settings, dropped } = useMemo(() => {
    const sal = salvage(SettingsSchema, raw)
    // The schema is intentionally permissive on `perAgentModel` /
    // `pricingOverrides` value shapes so a single bad entry can't wipe the
    // whole map. The structural cast here moves us into `SettingsLoose` so
    // `postProcess` can do per-entry recovery.
    return { settings: postProcess(sal.value as unknown as SettingsLoose), dropped: sal.dropped }
  }, [raw])

  // Boot-only: persist salvaged shape + invoke dropped callback once if
  // anything was actually dropped. Effect runs with [] deps intentionally —
  // this is a one-shot boot report. The salvaged `settings` is the value at
  // first commit; React's StrictMode double-invoke is gated by didReportRef.
  const onDroppedRef = useRef(opts.onDropped)
  onDroppedRef.current = opts.onDropped
  const didReportRef = useRef(false)
  useEffect(() => {
    if (didReportRef.current) return
    didReportRef.current = true
    // Two reasons to persist back on first mount:
    //  1. Salvage dropped fields (broken values replaced by defaults) — surface
    //     the toast so the user knows.
    //  2. Raw shape carries legacy top-level keys the schema doesn't know
    //     about (e.g. `prompts`, `promptOverrides`). Without an active cleanup
    //     these stick around forever because `update()` spreads from `prev`,
    //     not the post-processed `settings`. Strip them silently — they were
    //     never "reset", they just no longer exist.
    const rawObj = (raw && typeof raw === 'object' && !Array.isArray(raw))
      ? (raw as Record<string, unknown>)
      : {}
    const knownKeys = SettingsSchema.shape
    const hasLegacyKeys = Object.keys(rawObj).some((k) => !(k in knownKeys))
    if (dropped.length === 0 && !hasLegacyKeys) return
    setRaw(settings)
    if (dropped.length > 0) {
      const cb = onDroppedRef.current
      if (cb) cb(dropped)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const update = useCallback((patch: Partial<Settings>) => {
    setRaw((prev) => {
      const prevObj = (prev && typeof prev === 'object') ? prev : ({} as Settings)
      return { ...prevObj, ...patch }
    })
  }, [setRaw])

  const modelForAgent = useCallback((modeId: string, agentId: string): AgentModelRef => {
    const fallback: AgentModelRef = {
      provider: settings.provider,
      model: settings.defaultModel[settings.provider] ?? '',
    }
    if (settings.useDefaultModelForAll) return fallback
    return settings.perAgentModel[modeId]?.[agentId] ?? fallback
  }, [settings])

  const getActionPrompt = useCallback((mode: Mode, actionId: string): string => {
    const action = mode.actions.find((a) => a.id === actionId)
    if (!action) throw new Error(`Unknown action: ${actionId} in mode ${mode.id}`)
    return action.prompt
  }, [])

  // Listener registry for contributions that live outside React's render tree.
  // Hook consumers re-render via the `settings` value; non-React code (e.g.
  // theme.contribution.ts) subscribes and re-reads on each fire.
  const listenersRef = useRef<Set<() => void>>(new Set())

  const subscribe = useCallback((cb: () => void): (() => void) => {
    listenersRef.current.add(cb)
    return () => { listenersRef.current.delete(cb) }
  }, [])

  // Fire listeners after commit so they observe the latest settings.
  // Skip the initial mount notification — contributions call apply() once
  // themselves on register and don't need a no-op refresh.
  const didMountRef = useRef(false)
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }
    for (const l of listenersRef.current) {
      try { l() } catch (e) { console.error('settings listener threw', e) }
    }
  }, [settings])

  return useMemo(() => ({
    settings,
    update,
    getActionPrompt,
    modelForAgent,
    subscribe,
  }), [settings, update, getActionPrompt, modelForAgent, subscribe])
}
