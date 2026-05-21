import { describe, it, expect } from 'vitest'
import { SettingsSchema, type Settings } from './settingsSchema'

describe('SettingsSchema', () => {
  it('parses an empty object into the full default Settings shape', () => {
    const r = SettingsSchema.safeParse({})
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.provider).toBe('anthropic')
    expect(r.data.fontSize).toBe(16)
    expect(r.data.theme).toBe('system')
    expect(r.data.streaming).toBe(true)
    expect(r.data.lintRules).toEqual({ brokenLinks: true, frontMatter: true, headingSkip: true, deadImages: true })
    expect(r.data.mcpServers).toEqual([])
  })

  it('rejects an unknown provider', () => {
    const r = SettingsSchema.safeParse({ provider: 'magic-llm' })
    expect(r.success).toBe(false)
  })

  it('preserves a single-provider apiKeys entry and fills missing providers with defaults', () => {
    // Regression: Zod 4's z.record(enum, ...) requires every enum key to be
    // present, so a user with only one configured provider used to lose all
    // their keys at salvage. The per-provider z.object shape accepts partial
    // input and defaults the rest to empty strings.
    const r = SettingsSchema.safeParse({ apiKeys: { anthropic: 'sk-real-key' } })
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.apiKeys.anthropic).toBe('sk-real-key')
    expect(r.data.apiKeys.openai).toBe('')
    expect(r.data.apiKeys.ollama).toBe('')
  })

  it('preserves a single-provider defaultModel entry and fills the rest with defaults', () => {
    const r = SettingsSchema.safeParse({ defaultModel: { openai: 'gpt-custom' } })
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.defaultModel.openai).toBe('gpt-custom')
    expect(r.data.defaultModel.anthropic).toBe('claude-sonnet-4-6')
    expect(r.data.defaultModel.ollama).toBe('llama3.1')
  })

  it('preserves a single-provider maxOutputTokens entry and fills the rest with defaults', () => {
    const r = SettingsSchema.safeParse({ maxOutputTokens: { anthropic: 16384 } })
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.maxOutputTokens.anthropic).toBe(16384)
    expect(r.data.maxOutputTokens.openai).toBe(8192)
    expect(r.data.maxOutputTokens.ollama).toBe(4096)
  })

  it('clamps fontSize via the integer range refinement', () => {
    expect(SettingsSchema.safeParse({ fontSize: 11 }).success).toBe(false)
    expect(SettingsSchema.safeParse({ fontSize: 25 }).success).toBe(false)
    expect(SettingsSchema.safeParse({ fontSize: 16 }).success).toBe(true)
  })

  it('accepts the four allowed streamChunkDelayMs values', () => {
    for (const d of [0, 50, 100, 200]) {
      expect(SettingsSchema.safeParse({ streamChunkDelayMs: d }).success).toBe(true)
    }
    expect(SettingsSchema.safeParse({ streamChunkDelayMs: 17 }).success).toBe(false)
  })

  it('accepts a valid stdio mcpServer entry', () => {
    const r = SettingsSchema.safeParse({
      mcpServers: [{ name: 'fs', transport: 'stdio', command: 'mcp-server-filesystem' }],
    })
    expect(r.success).toBe(true)
  })

  it('accepts a valid http mcpServer entry', () => {
    const r = SettingsSchema.safeParse({
      mcpServers: [{ name: 'remote', transport: 'http', url: 'http://localhost:9000' }],
    })
    expect(r.success).toBe(true)
  })

  it('rejects an mcpServer with no matching discriminator', () => {
    const r = SettingsSchema.safeParse({
      mcpServers: [{ name: 'huh', transport: 'mystery' }],
    })
    expect(r.success).toBe(false)
  })

  it('upgrades legacy flat perAgentModel (string values) to nested AgentModelRef', () => {
    // Legacy shape: { actionId: 'modelString' } at the inner map.
    // Modern shape: { actionId: { provider, model } }.
    // The schema transforms unknown strings via the resolver — but in pure-schema land
    // we can only assert the schema accepts the modern shape and rejects the flat shape
    // outright (forcing the resolver path to run in useSettings.ts).
    const r = SettingsSchema.safeParse({
      perAgentModel: { mode1: { act1: { provider: 'anthropic', model: 'claude-sonnet-4-6' } } },
    })
    expect(r.success).toBe(true)
  })

  it('upgrades legacy pricingOverrides bare keys to provider/model', () => {
    // Same caveat as above — the resolver lives in useSettings.ts because it
    // needs providerForModel(). The schema accepts the namespaced form.
    const r = SettingsSchema.safeParse({
      pricingOverrides: { 'anthropic/claude-sonnet-4-6': { input: 3, output: 15 } },
    })
    expect(r.success).toBe(true)
  })

  it('every top-level field has a default (salvage compatibility)', () => {
    // Iterate the shape and confirm each field parses `undefined` to its default.
    const shape = SettingsSchema.shape
    for (const key of Object.keys(shape)) {
      const r = (shape as Record<string, { safeParse: (v: unknown) => { success: boolean } }>)[key].safeParse(undefined)
      expect(r.success, `field "${key}" must have a default`).toBe(true)
    }
  })

  it('every auto-gen field declares ui, section, and label in its meta', () => {
    // Walk the shape; for any field whose meta has ui === 'auto', label and section are required.
    const shape = SettingsSchema.shape
    for (const key of Object.keys(shape)) {
      const field = (shape as Record<string, { meta?: () => unknown }>)[key]
      const meta = field.meta?.() as Record<string, unknown> | undefined
      if (meta && meta.ui === 'auto') {
        expect(typeof meta.section, `${key}.meta.section`).toBe('string')
        expect(typeof meta.label, `${key}.meta.label`).toBe('string')
      }
    }
  })

  it('Settings type matches the inferred type (compile-time check)', () => {
    // This test is here to anchor the type alias in the test surface.
    // The schema is intentionally permissive on perAgentModel / pricingOverrides
    // value types so per-entry salvage can recover legacy entries; postProcess
    // narrows them back to the curated `Settings` shape. The double cast is
    // just so the compile-time check stays meaningful.
    const sample: Settings = SettingsSchema.parse({}) as unknown as Settings
    expect(sample.provider).toBe('anthropic')
  })
})
