import type { ChatSession } from '../../../hooks/useChatSessions'
import type { ChatMessage } from '../../ChatPanel'
import { CollapsibleBlob } from './CollapsibleBlob'
import { ChatTurnBlock } from './ChatTurnBlock'

interface Props {
  session: ChatSession
  /** System preamble rebuilt at render time (see buildChatSystemPreamble). */
  systemText: string
}

const EMPTY_USER: ChatMessage = { id: '__none__', role: 'user', content: '(no user trigger recorded)' }

interface TurnPair {
  user: ChatMessage
  assistant: ChatMessage
}

function pairTurns(messages: ChatMessage[]): TurnPair[] {
  const turns: TurnPair[] = []
  let pendingUser: ChatMessage | null = null
  for (const m of messages) {
    if (m.role === 'user') {
      pendingUser = m
    } else {
      turns.push({ user: pendingUser ?? EMPTY_USER, assistant: m })
      pendingUser = null
    }
  }
  return turns
}

export function ChatInspector({ session, systemText }: Props) {
  const turns = pairTurns(session.messages)
  const totalIn = turns.reduce((s, t) => s + (t.assistant.tokenUsage?.input ?? 0), 0)
  const totalOut = turns.reduce((s, t) => s + (t.assistant.tokenUsage?.output ?? 0), 0)

  return (
    <div className="space-y-3 font-mono">
      <div data-testid="chat-meta" className="text-[11px] text-muted">
        {session.provider} · {session.model} · {turns.length} turns · in {totalIn} / out {totalOut}
      </div>

      <CollapsibleBlob name="system" body={systemText} />

      {turns.length === 0 ? (
        <div className="text-subtle text-[11px] italic">No turns yet.</div>
      ) : (
        turns.map((t, i) => (
          <ChatTurnBlock
            key={t.assistant.id}
            turnIndex={i + 1}
            userMessage={t.user}
            assistantMessage={t.assistant}
          />
        ))
      )}
    </div>
  )
}
