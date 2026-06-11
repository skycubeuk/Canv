import type { ChatMessage } from '../components/ChatPanel'
import type { ModelPricing } from '../config/pricing'
import { PRICING } from '../config/pricing'
import type { Provider } from '../adapters'
import { cost } from './cost'

/**
 * Aggregates token counts and USD cost across all assistant messages in a
 * conversation.  Mirrors the "session" calculation in ChatMeter so both
 * surfaces agree on the numbers shown.
 *
 * @param messages  Full message list (user + assistant).
 * @param provider  Provider id used to resolve pricing.
 * @param model     Model ID used to resolve pricing.
 * @param overrides Per-model pricing overrides (from user settings).
 * @param defaults  Fallback pricing table — injectable for tests.
 */
export function chatTotals(
  messages: ChatMessage[],
  provider: Provider,
  model: string,
  overrides: Record<string, ModelPricing>,
  defaults: Record<string, ModelPricing> = PRICING,
): { tokens: number; costUsd: number } {
  const assistantMsgs = messages.filter((m) => m.role === 'assistant')

  const sessionUsage = assistantMsgs.reduce(
    (acc, m) => ({
      input: acc.input + (m.tokenUsage?.input ?? 0),
      output: acc.output + (m.tokenUsage?.output ?? 0),
      cacheRead: acc.cacheRead + (m.tokenUsage?.cacheRead ?? 0),
      cacheWrite: acc.cacheWrite + (m.tokenUsage?.cacheWrite ?? 0),
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  )

  // input is the uncached remainder only — cached tokens are still prompt tokens.
  const tokens = sessionUsage.input + sessionUsage.cacheRead + sessionUsage.cacheWrite + sessionUsage.output
  const costUsd = cost(sessionUsage, provider, model, overrides, defaults) ?? 0

  return { tokens, costUsd }
}
