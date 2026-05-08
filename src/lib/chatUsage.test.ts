import { describe, it, expect } from 'vitest'
import { chatTotals } from './chatUsage'
import type { ChatMessage } from '../components/ChatPanel'
import type { ModelPricing } from '../config/pricing'

const baseMsg = (
  id: string,
  role: 'user' | 'assistant',
  input?: number,
  output?: number,
): ChatMessage => ({
  id,
  role,
  content: 'x',
  ...(input != null && output != null ? { tokenUsage: { input, output } } : {}),
})

describe('chatTotals', () => {
  it('returns zero when no messages', () => {
    expect(chatTotals([], 'm', {})).toEqual({ tokens: 0, costUsd: 0 })
  })

  it('sums tokens across messages with usage', () => {
    const msgs = [
      baseMsg('1', 'user'),
      baseMsg('2', 'assistant', 100, 50),
      baseMsg('3', 'assistant', 200, 75),
    ]
    expect(chatTotals(msgs, 'm', {}).tokens).toBe(425)
  })

  it('applies pricing when override is present', () => {
    const msgs = [baseMsg('1', 'assistant', 1_000_000, 500_000)]
    const overrides: Record<string, ModelPricing> = { 'claude-x': { input: 3, output: 15 } }
    const result = chatTotals(msgs, 'claude-x', overrides, {})
    expect(result.tokens).toBe(1_500_000)
    // 1M @ $3 + 0.5M @ $15 = $3 + $7.50 = $10.50
    expect(result.costUsd).toBeCloseTo(10.5, 2)
  })

  it('returns 0 cost when no pricing override matches', () => {
    const msgs = [baseMsg('1', 'assistant', 1000, 500)]
    expect(chatTotals(msgs, 'unknown', {}, {}).costUsd).toBe(0)
  })

  it('only counts assistant messages for cost, not user messages', () => {
    const msgs = [
      baseMsg('1', 'user', 5000, 0),
      baseMsg('2', 'assistant', 1_000_000, 500_000),
    ]
    const overrides: Record<string, ModelPricing> = { 'm': { input: 3, output: 15 } }
    const result = chatTotals(msgs, 'm', overrides, {})
    // user message with tokenUsage should not be counted
    expect(result.tokens).toBe(1_500_000)
  })
})
