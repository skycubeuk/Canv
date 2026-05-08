import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatMeter } from './ChatMeter'
import type { ChatMessage } from './ChatPanel'

const KNOWN_PRICING = { 'anthropic/m-known': { input: 3, output: 15 } }

const asst = (id: string, usage?: { input: number; output: number }): ChatMessage => ({
  id,
  role: 'assistant',
  content: 'reply',
  ...(usage ? { tokenUsage: usage } : {}),
})

describe('ChatMeter', () => {
  it('renders nothing when there are no messages', () => {
    const { container } = render(
      <ChatMeter messages={[]} provider="anthropic" model="m-known" overrides={{}} defaults={KNOWN_PRICING} busy={false} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows latest turn input/output and computed cost', () => {
    const messages = [asst('a1', { input: 1000, output: 500 })]
    render(
      <ChatMeter messages={messages} provider="anthropic" model="m-known" overrides={{}} defaults={KNOWN_PRICING} busy={false} />,
    )
    // 1000 in / 500 out
    expect(screen.getByText(/1,000\s*in/)).toBeInTheDocument()
    expect(screen.getByText(/500\s*out/)).toBeInTheDocument()
    // cost = (1000*3 + 500*15)/1e6 = 0.0105 → $0.011 (3dp)
    // turn cost AND session cost both equal $0.011 here (single message); accept either count.
    expect(screen.getAllByText(/\$0\.011/).length).toBeGreaterThanOrEqual(1)
  })

  it('sums cumulative session usage and cost across assistant messages', () => {
    const messages = [
      asst('a1', { input: 1000, output: 500 }),
      asst('a2', { input: 2000, output: 1000 }),
    ]
    render(
      <ChatMeter messages={messages} provider="anthropic" model="m-known" overrides={{}} defaults={KNOWN_PRICING} busy={false} />,
    )
    // session = (3000*3 + 1500*15)/1e6 = 0.0315 → $0.032
    expect(screen.getByText(/session:\s*\$0\.032/)).toBeInTheDocument()
  })

  it('shows "…" for turn fields while busy and the latest assistant has no usage yet', () => {
    const messages: ChatMessage[] = [{ id: 'a1', role: 'assistant', content: '' }]
    render(
      <ChatMeter messages={messages} provider="anthropic" model="m-known" overrides={{}} defaults={KNOWN_PRICING} busy={true} />,
    )
    expect(screen.getByText(/turn:\s*…\s*in/)).toBeInTheDocument()
    expect(screen.getByText(/streaming/i)).toBeInTheDocument()
  })

  it('renders "—" when pricing is unresolved', () => {
    const messages = [asst('a1', { input: 100, output: 50 })]
    render(
      <ChatMeter messages={messages} provider="anthropic" model="m-unknown" overrides={{}} defaults={KNOWN_PRICING} busy={false} />,
    )
    expect(screen.getAllByText(/—/).length).toBeGreaterThan(0)
  })
})
