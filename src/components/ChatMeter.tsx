import { useMemo } from 'react'
import type { ChatMessage } from './ChatPanel'
import type { ModelPricing } from '../config/pricing'
import { cost } from '../lib/cost'

interface Props {
  messages: ChatMessage[]
  model: string
  overrides: Record<string, ModelPricing>
  /** Injectable for tests; production callers can omit (use PRICING from config). */
  defaults?: Record<string, ModelPricing>
  busy: boolean
}

const fmtCost = (n: number | null): string => (n == null ? '—' : `$${n.toFixed(3)}`)
const fmtNum = (n: number): string => n.toLocaleString('en-US')

export function ChatMeter({ messages, model, overrides, defaults, busy }: Props) {
  const { turn, session } = useMemo(() => {
    const assistantMsgs = messages.filter((m) => m.role === 'assistant')
    if (assistantMsgs.length === 0) return { turn: null, session: null }
    const latest = assistantMsgs[assistantMsgs.length - 1]
    const sessionUsage = assistantMsgs.reduce(
      (acc, m) => ({
        input: acc.input + (m.tokenUsage?.input ?? 0),
        output: acc.output + (m.tokenUsage?.output ?? 0),
      }),
      { input: 0, output: 0 },
    )
    return {
      turn: latest.tokenUsage ?? null,
      session: sessionUsage,
    }
  }, [messages])

  if (messages.length === 0) return null
  if (!session) return null

  const sessionCost = cost(session, model, overrides, defaults)
  const turnCost = turn ? cost(turn, model, overrides, defaults) : null

  const turnText = turn
    ? `turn: ${fmtNum(turn.input)} in / ${fmtNum(turn.output)} out · ${fmtCost(turnCost)}`
    : busy
      ? 'turn: … in / … out · —'
      : 'turn: — in / — out · —'

  return (
    <div
      className="border-t border-default bg-panel/60 px-3 py-1 text-[10px] font-mono text-muted flex justify-between"
      aria-label="chat token and cost meter"
    >
      <span>{turnText}</span>
      <span>
        {busy && <span className="text-emerald-500">● streaming · </span>}
        session: {fmtCost(sessionCost)}
      </span>
    </div>
  )
}
