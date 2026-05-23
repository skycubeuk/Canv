import type { ChatMessage } from '../../ChatPanel'
import { CollapsibleBlob } from './CollapsibleBlob'

interface Props {
  turnIndex: number
  userMessage: ChatMessage
  assistantMessage: ChatMessage
}

export function ChatTurnBlock({ turnIndex, userMessage, assistantMessage }: Props) {
  if (assistantMessage.synthetic) {
    return (
      <section className="my-3" data-testid="turn-section">
        <header className="text-[11px] uppercase tracking-wide text-muted mb-1">Turn {turnIndex}</header>
        <div data-testid="synthetic-note" className="text-subtle italic text-[11px]">
          {assistantMessage.content}
        </div>
      </section>
    )
  }

  const calls = assistantMessage.toolCalls ?? []
  const results = assistantMessage.toolResults ?? []

  return (
    <section className="my-3" data-testid="turn-section">
      <header className="text-[11px] uppercase tracking-wide text-muted mb-1">Turn {turnIndex}</header>

      <div className="mb-1">
        <div className="text-[10px] uppercase tracking-wide text-muted">user</div>
        <pre className="whitespace-pre-wrap wrap-break-word text-default">{userMessage.content}</pre>
      </div>

      <div className="mb-1">
        <div className="text-[10px] uppercase tracking-wide text-muted">assistant</div>
        <pre className="whitespace-pre-wrap wrap-break-word text-default">
          {assistantMessage.content || <em className="text-subtle">(no text)</em>}
        </pre>
      </div>

      <div data-testid="turn-meta" className="text-[10px] text-muted mb-1">
        {assistantMessage.stopReason ?? '—'}
        {assistantMessage.tokenUsage
          ? ` · in ${assistantMessage.tokenUsage.input} / out ${assistantMessage.tokenUsage.output}`
          : ''}
      </div>

      {calls.map((c) => (
        <CollapsibleBlob
          key={`call-${c.id}`}
          name={`tool_call · ${c.name}`}
          body={JSON.stringify(c.input, null, 2)}
        />
      ))}

      {results.map((r) => (
        <CollapsibleBlob
          key={`result-${r.id}`}
          name={`tool_result · ${r.id.slice(0, 10)}`}
          body={r.content}
          error={r.isError}
          denied={r.isUserDenial === true}
        />
      ))}

      {assistantMessage.failureReason === 'provider_error' && assistantMessage.errorInfo && (
        <div data-testid="turn-error" className="mt-1 text-[11px] text-danger-fg">
          [{assistantMessage.errorInfo.kind}
          {assistantMessage.errorInfo.statusCode ? ` ${assistantMessage.errorInfo.statusCode}` : ''}
          ] {assistantMessage.errorInfo.message}
        </div>
      )}
    </section>
  )
}
