import { z } from 'zod'
import { DEFAULT_ACCENT } from '../lib/accent'

/** Field-level metadata read by SchemaSettingsForm + the future workspace-settings loader. */
export interface SettingsFieldMeta {
  /** Opt-in for the generic renderer. Fields without this are skipped. */
  ui?: 'auto'
  /** Logical group in the Settings tab. Renderer groups fields by section. */
  section?: string
  /** Display label. Required when ui === 'auto'. */
  label?: string
  /** Tooltip / help text. Optional. */
  help?: string
  /** For z.array(z.object(...)): function that produces a one-line summary
   *  for a row in the collapsed list view. */
  itemLabel?: (item: unknown) => string
  /** Workspace-settings forward-compat — see workspace settings design note. */
  scope?: 'user' | 'workspace' | 'both'
  /** Hide from auto-gen even if section is set (e.g. dev-only fields). */
  hidden?: boolean
}

export const Provider = z.enum(['anthropic', 'openai', 'ollama'])
export type Provider = z.infer<typeof Provider>

const Theme = z.enum(['light', 'dark', 'system'])
const LineWidth = z.enum(['narrow', 'normal', 'wide'])
const StreamDelay = z.union([z.literal(0), z.literal(50), z.literal(100), z.literal(200)])

const AgentModelRefSchema = z.object({ provider: Provider, model: z.string() })

const ModelPricingSchema = z.object({
  input: z.number().finite(),
  output: z.number().finite(),
})

const McpServerStdio = z.object({
  name: z.string().min(1),
  transport: z.literal('stdio'),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
})

const McpServerHttp = z.object({
  name: z.string().min(1),
  transport: z.literal('http'),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
})

export const McpServerConfigSchema = z.discriminatedUnion('transport', [McpServerStdio, McpServerHttp])
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>

const LintRules = z.object({
  brokenLinks: z.boolean().default(true),
  frontMatter: z.boolean().default(true),
  headingSkip: z.boolean().default(true),
  deadImages: z.boolean().default(true),
}).default({ brokenLinks: true, frontMatter: true, headingSkip: true, deadImages: true })

// Per-provider records use z.object(...) rather than z.record(Provider, ...)
// because Zod 4's record-with-enum-key requires EVERY enum value to be present
// on parse. A user who has only configured one provider (the common case)
// would otherwise fail parse → field reset to default → key lost on salvage.
// The z.object form lets each provider field default independently and accepts
// partial input. Output shape is unchanged — all three keys always present.
const ApiKeys = z.object({
  anthropic: z.string().default(''),
  openai: z.string().default(''),
  ollama: z.string().default(''),
}).default({ anthropic: '', openai: '', ollama: '' })

const DefaultModel = z.object({
  anthropic: z.string().default('claude-sonnet-4-6'),
  openai: z.string().default('gpt-5.5'),
  ollama: z.string().default('llama3.1'),
}).default({ anthropic: 'claude-sonnet-4-6', openai: 'gpt-5.5', ollama: 'llama3.1' })

const MaxOutputTokens = z.object({
  anthropic: z.number().int().positive().default(8192),
  openai: z.number().int().positive().default(8192),
  ollama: z.number().int().positive().default(4096),
}).default({ anthropic: 8192, openai: 8192, ollama: 4096 })

const BaseUrls = z.partialRecord(Provider, z.string()).default({ ollama: '' })

export const SettingsSchema = z.object({
  provider: Provider.default('anthropic').meta({
    ui: 'auto', section: 'provider', label: 'Default provider', scope: 'workspace',
  }),
  apiKeys: ApiKeys,  // bespoke UI in SettingsTab — no auto-gen
  defaultModel: DefaultModel,  // bespoke UI — model picker grid
  useDefaultModelForAll: z.boolean().default(true),
  // Permissive on purpose — legacy storage may hold inner values as bare model-id
  // strings, and a single bad entry would otherwise wipe the whole map at salvage
  // time. The post-salvage `postProcess` pass in `useSettings.ts` does the per-
  // entry upgrade (string → AgentModelRef) and clamps against live adapter models.
  perAgentModel: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  fontSize: z.number().int().min(12).max(24).default(16).meta({
    ui: 'auto', section: 'appearance', label: 'Editor font size', scope: 'workspace',
  }),
  chatFontSize: z.number().int().min(12).max(24).default(14).meta({
    ui: 'auto', section: 'appearance', label: 'Chat font size', scope: 'workspace',
  }),
  lineWidth: LineWidth.default('normal').meta({
    ui: 'auto', section: 'appearance', label: 'Line width', scope: 'workspace',
  }),
  theme: Theme.default('system').meta({
    ui: 'auto', section: 'appearance', label: 'Theme', scope: 'workspace',
  }),
  streaming: z.boolean().default(true).meta({
    ui: 'auto', section: 'chat', label: 'Stream responses',
  }),
  maxOutputTokens: MaxOutputTokens,  // bespoke UI (per-provider grid)
  baseUrls: BaseUrls,  // bespoke UI (per-provider, only ollama today)
  ollamaModels: z.array(z.string()).default([]),  // populated by Refresh button
  chatToolBudget: z.number().int().min(1).max(50).default(10).meta({
    ui: 'auto', section: 'chat', label: 'Tool-call budget per turn',
    help: 'Maximum tool calls the assistant may chain in a single response.',
  }),
  // Permissive value type for the same reason as `perAgentModel`: a single NaN
  // entry must not nuke the whole map. `postProcess` filters non-finite numbers
  // and re-keys bare model-ids to `${provider}/${model}`.
  pricingOverrides: z.record(z.string(), z.unknown()).default({}),
  streamChunkDelayMs: StreamDelay.default(0).meta({
    ui: 'auto', section: 'chat', label: 'Stream chunk delay (ms)',
  }),
  autoScroll: z.boolean().default(true).meta({
    ui: 'auto', section: 'chat', label: 'Auto-scroll chat',
  }),
  lintRules: LintRules,  // bespoke UI (toggle group)
  accent: z.string().default(DEFAULT_ACCENT).meta({
    ui: 'auto', section: 'appearance', label: 'Accent colour', hidden: true,
    // hidden=true: the existing AppearanceSection has a colour picker; we don't
    // want a duplicate auto-gen text input. Stays in the schema so the future
    // workspace-settings loader sees it.
  }),
  mcpServers: z.array(McpServerConfigSchema).default([]).meta({
    ui: 'auto', section: 'mcp', label: 'MCP servers',
    help: 'Model Context Protocol servers available to chat and to gated extensions.',
    itemLabel: (item: unknown) => {
      const it = item as Partial<McpServerConfig> | undefined
      return it?.name || '(unnamed server)'
    },
  }),
})

export type AgentModelRef = z.infer<typeof AgentModelRefSchema>
export type ModelPricing = z.infer<typeof ModelPricingSchema>
export type Theme = z.infer<typeof Theme>
export type LineWidth = z.infer<typeof LineWidth>
export type StreamChunkDelayMs = z.infer<typeof StreamDelay>

/** Inferred settings type, with the two permissive record fields tightened
 *  back to the curated shape that `postProcess` guarantees. Without these
 *  overrides downstream consumers would see `Record<string, unknown>` and lose
 *  all the structural typing the rest of the codebase relies on. */
export type Settings = Omit<z.infer<typeof SettingsSchema>, 'perAgentModel' | 'pricingOverrides'> & {
  perAgentModel: Record<string, Record<string, AgentModelRef>>
  pricingOverrides: Record<string, ModelPricing>
}
