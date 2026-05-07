import { describe, it, expect } from 'vitest'
import { cost } from './cost'
import type { ModelPricing } from '../config/pricing'

const KNOWN: Record<string, ModelPricing> = {
  'm-known': { input: 3, output: 15 },
}

describe('cost', () => {
  it('computes cost from default pricing', () => {
    // 1M in @ $3/M + 0.5M out @ $15/M = $3 + $7.5 = $10.5
    expect(cost({ input: 1_000_000, output: 500_000 }, 'm-known', {}, KNOWN)).toBeCloseTo(10.5, 6)
  })

  it('override takes precedence over default', () => {
    const overrides = { 'm-known': { input: 6, output: 30 } } satisfies Record<string, ModelPricing>
    // doubles
    expect(cost({ input: 1_000_000, output: 500_000 }, 'm-known', overrides, KNOWN)).toBeCloseTo(21, 6)
  })

  it('returns null when model is unknown', () => {
    expect(cost({ input: 1000, output: 1000 }, 'm-missing', {}, KNOWN)).toBeNull()
  })

  it('returns null when resolved pricing has any field ≤ 0 (placeholder or partial)', () => {
    const placeholder: Record<string, ModelPricing> = { 'm-zero': { input: 0, output: 0 } }
    expect(cost({ input: 1000, output: 1000 }, 'm-zero', {}, placeholder)).toBeNull()
  })

  it('returns null when resolved pricing has one positive and one zero field', () => {
    const partial: Record<string, ModelPricing> = { 'm-half': { input: 3, output: 0 } }
    expect(cost({ input: 1000, output: 1000 }, 'm-half', {}, partial)).toBeNull()
  })

  it('override with input ≤ 0 falls through to default', () => {
    const overrides = { 'm-known': { input: 0, output: 30 } } satisfies Record<string, ModelPricing>
    // falls through to default {input:3, output:15}
    expect(cost({ input: 1_000_000, output: 0 }, 'm-known', overrides, KNOWN)).toBeCloseTo(3, 6)
  })

  it('returns null on NaN inputs', () => {
    expect(cost({ input: NaN, output: 0 }, 'm-known', {}, KNOWN)).toBeNull()
    expect(cost({ input: 0, output: NaN }, 'm-known', {}, KNOWN)).toBeNull()
  })

  it('zero usage gives zero cost when pricing exists', () => {
    expect(cost({ input: 0, output: 0 }, 'm-known', {}, KNOWN)).toBe(0)
  })
})
