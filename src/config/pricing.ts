/** USD per 1M tokens. */
export interface ModelPricing {
  input: number
  output: number
}

/**
 * Default pricing per model — standard short-context rates in USD per 1M
 * tokens, excluding cached / batch / long-context tiers.
 *
 * Sources (verified May 2026):
 * - Anthropic: https://platform.claude.com/docs/en/about-claude/pricing
 * - OpenAI:    https://developers.openai.com/api/docs/pricing
 *
 * Update when providers ship new models or change rates. Models absent
 * from this map fall through to `null` in cost() and render as "—".
 */
export const PRICING: Record<string, ModelPricing> = {
  // Model IDs MUST match the strings declared in src/adapters/{anthropic,openai}.ts
  // — these are the canonical IDs that pass through CompleteParams.model.
  'claude-sonnet-4-6':         { input: 3,    output: 15 },
  'claude-opus-4-7':           { input: 5,    output: 25 },
  'claude-haiku-4-5-20251001': { input: 1,    output: 5 },
  'gpt-5.5':                   { input: 5,    output: 30 },
  'gpt-5.5-pro':               { input: 30,   output: 180 },
  'gpt-5.4-mini':              { input: 0.75, output: 4.5 },
  'gpt-5.4-nano':              { input: 0.2,  output: 1.25 },
}
