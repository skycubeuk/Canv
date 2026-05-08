import type { ChatMessage } from '../components/ChatPanel'
import type { ModelPricing } from '../config/pricing'
import { PRICING } from '../config/pricing'
import { cost } from './cost'

/**
 * Aggregates token counts and USD cost across all assistant messages in a
 * conversation.  Mirrors the "session" calculation in ChatMeter so both
 * surfaces agree on the numbers shown.
 *
 * @param messages  Full message list (user + assistant).
 * @param model     Model ID used to resolve pricing.
 * @param overrides Per-model pricing overrides (from user settings).
 * @param defaults  Fallback pricing table — injectable for tests.
 */
export function chatTotals(
  messages: ChatMessage[],
  model: string,
  overrides: Record<string, ModelPricing>,
  defaults: Record<string, ModelPricing> = PRICING,
): { tokens: number; costUsd: number } {
  const assistantMsgs = messages.filter((m) => m.role === 'assistant')

  const sessionUsage = assistantMsgs.reduce(
    (acc, m) => ({
      input: acc.input + (m.tokenUsage?.input ?? 0),
      output: acc.output + (m.tokenUsage?.output ?? 0),
    }),
    { input: 0, output: 0 },
  )

  const tokens = sessionUsage.input + sessionUsage.output
  const costUsd = cost(sessionUsage, model, overrides, defaults) ?? 0

  return { tokens, costUsd }
}
