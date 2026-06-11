import { describe, it, expect } from 'vitest'
import { cost } from './cost'
import type { ModelPricing } from '../config/pricing'

const KNOWN: Record<string, ModelPricing> = {
  'anthropic/m-known': { input: 3, output: 15 },
}

describe('cost', () => {
  it('computes cost from default pricing', () => {
    // 1M in @ $3/M + 0.5M out @ $15/M = $3 + $7.5 = $10.5
    expect(cost({ input: 1_000_000, output: 500_000 }, 'anthropic', 'm-known', {}, KNOWN)).toBeCloseTo(10.5, 6)
  })

  it('override takes precedence over default', () => {
    const overrides = { 'anthropic/m-known': { input: 6, output: 30 } } satisfies Record<string, ModelPricing>
    // doubles
    expect(cost({ input: 1_000_000, output: 500_000 }, 'anthropic', 'm-known', overrides, KNOWN)).toBeCloseTo(21, 6)
  })

  it('returns null when model is unknown', () => {
    expect(cost({ input: 1000, output: 1000 }, 'anthropic', 'm-missing', {}, KNOWN)).toBeNull()
  })

  it('returns null when resolved pricing has any field ≤ 0 (placeholder or partial)', () => {
    const placeholder: Record<string, ModelPricing> = { 'anthropic/m-zero': { input: 0, output: 0 } }
    expect(cost({ input: 1000, output: 1000 }, 'anthropic', 'm-zero', {}, placeholder)).toBeNull()
  })

  it('returns null when resolved pricing has one positive and one zero field', () => {
    const partial: Record<string, ModelPricing> = { 'anthropic/m-half': { input: 3, output: 0 } }
    expect(cost({ input: 1000, output: 1000 }, 'anthropic', 'm-half', {}, partial)).toBeNull()
  })

  it('override with input ≤ 0 falls through to default', () => {
    const overrides = { 'anthropic/m-known': { input: 0, output: 30 } } satisfies Record<string, ModelPricing>
    // falls through to default {input:3, output:15}
    expect(cost({ input: 1_000_000, output: 0 }, 'anthropic', 'm-known', overrides, KNOWN)).toBeCloseTo(3, 6)
  })

  it('returns null on NaN inputs', () => {
    expect(cost({ input: NaN, output: 0 }, 'anthropic', 'm-known', {}, KNOWN)).toBeNull()
    expect(cost({ input: 0, output: NaN }, 'anthropic', 'm-known', {}, KNOWN)).toBeNull()
  })

  it('zero usage gives zero cost when pricing exists', () => {
    expect(cost({ input: 0, output: 0 }, 'anthropic', 'm-known', {}, KNOWN)).toBe(0)
  })

  it('keys by composite provider/model — same model id under a different provider does not match', () => {
    // Bedrock-style scenario: another provider exposes the same model name.
    expect(cost({ input: 1000, output: 1000 }, 'openai', 'm-known', {}, KNOWN)).toBeNull()
  })
})

describe('cost — prompt-cache pricing', () => {
  const KNOWN2 = { 'anthropic/m-known': { input: 3, output: 15 } }

  it('bills cache reads at 0.1× and writes at 1.25× the input rate', () => {
    // 1M uncached input = $3; 1M cache read = $0.30; 1M cache write = $3.75
    expect(cost({ input: 0, output: 0, cacheRead: 1_000_000 }, 'anthropic', 'm-known', {}, KNOWN2)).toBeCloseTo(0.3, 6)
    expect(cost({ input: 0, output: 0, cacheWrite: 1_000_000 }, 'anthropic', 'm-known', {}, KNOWN2)).toBeCloseTo(3.75, 6)
    expect(cost({ input: 1_000_000, output: 0, cacheRead: 1_000_000, cacheWrite: 1_000_000 }, 'anthropic', 'm-known', {}, KNOWN2))
      .toBeCloseTo(3 + 0.3 + 3.75, 6)
  })

  it('treats absent cache fields as zero', () => {
    expect(cost({ input: 1_000_000, output: 0 }, 'anthropic', 'm-known', {}, KNOWN2)).toBeCloseTo(3, 6)
  })
})
