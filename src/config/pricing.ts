import type { Provider } from '../adapters'

/** USD per 1M tokens. */
export interface ModelPricing {
  input: number
  output: number
}

/**
 * Build the composite key used by `PRICING` and `pricingOverrides`. Two
 * adapters could legitimately list the same model id (e.g. AWS Bedrock
 * exposing a Claude model name already used by the direct Anthropic adapter)
 * with different rates; keying by `provider/model` keeps them separate.
 */
export const pricingKey = (provider: Provider, model: string): string =>
  `${provider}/${model}`

/**
 * Default pricing per (provider, model) — standard short-context rates in
 * USD per 1M tokens, excluding cached / batch / long-context tiers.
 *
 * Sources (verified May 2026; Opus 4.8 added):
 * - Anthropic: https://platform.claude.com/docs/en/about-claude/pricing
 * - OpenAI:    https://developers.openai.com/api/docs/pricing
 *
 * Update when providers ship new models or change rates. Models absent
 * from this map fall through to `null` in cost() and render as "—".
 */
export const PRICING: Record<string, ModelPricing> = {
  // Keys are `${provider}/${model}` — the model component MUST match the
  // strings declared in src/adapters/{anthropic,openai}.ts.
  'anthropic/claude-fable-5':            { input: 10,   output: 50 },
  'anthropic/claude-sonnet-4-6':         { input: 3,    output: 15 },
  'anthropic/claude-opus-4-8':           { input: 5,    output: 25 },
  'anthropic/claude-opus-4-7':           { input: 5,    output: 25 },
  'anthropic/claude-haiku-4-5-20251001': { input: 1,    output: 5 },
  'openai/gpt-5.5':                      { input: 5,    output: 30 },
  'openai/gpt-5.5-pro':                  { input: 30,   output: 180 },
  'openai/gpt-5.4-mini':                 { input: 0.75, output: 4.5 },
  'openai/gpt-5.4-nano':                 { input: 0.2,  output: 1.25 },
  'ollama/llama3.1':                     { input: 0,    output: 0 },
  'ollama/qwen2.5':                      { input: 0,    output: 0 },
  'ollama/mistral':                      { input: 0,    output: 0 },
}
