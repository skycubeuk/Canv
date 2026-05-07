import type { TokenUsage } from '../adapters/types'
import { PRICING, type ModelPricing } from '../config/pricing'

function isUsable(p: ModelPricing | undefined | null): p is ModelPricing {
  if (!p) return false
  if (!Number.isFinite(p.input) || !Number.isFinite(p.output)) return false
  if (p.input <= 0 || p.output <= 0) return false
  return true
}

/**
 * Returns USD cost for `usage` under `model`, applying override-then-default
 * resolution. Returns null when no usable pricing is found, when the resolved
 * entry has any field ≤ 0 (placeholder or partial pricing), or when `usage` carries
 * non-finite numbers.
 *
 * The `defaults` parameter is injectable for testing. Production code should
 * call `cost(usage, model, overrides)` and let the default argument apply.
 */
export function cost(
  usage: TokenUsage,
  model: string,
  overrides: Record<string, ModelPricing> = {},
  defaults: Record<string, ModelPricing> = PRICING,
): number | null {
  if (!Number.isFinite(usage.input) || !Number.isFinite(usage.output)) return null

  const override = overrides[model]
  const def = defaults[model]
  const resolved = isUsable(override) ? override : isUsable(def) ? def : null
  if (!resolved) return null

  return (usage.input * resolved.input + usage.output * resolved.output) / 1_000_000
}
