import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react'

interface ChatMessage {
  role: string  // 'user' | 'assistant'
  content: string
}

interface Props {
  history: ChatMessage[]
  pending: boolean
  onSend: (text: string) => void
}

// Assistant payloads in the Builder are JSON ({manifest, files}). Try to
// pull a useful one-line summary out so the chat shows something meaningful
// when collapsed.
function summariseAssistant(content: string): string {
  try {
    const text = content.trim()
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) return 'Generated payload'
    const parsed = JSON.parse(text.slice(start, end + 1))
    const m = parsed?.manifest
    if (m?.name && m?.version) {
      const fileCount = parsed?.files && typeof parsed.files === 'object' ? Object.keys(parsed.files).length : 0
      return `Generated "${m.name}" v${m.version} (${fileCount} file${fileCount === 1 ? '' : 's'})`
    }
    return 'Generated payload'
  } catch {
    // Not JSON — could be a pre-canned message like "I've loaded version X for editing."
    // Fall back to the first non-empty line.
    const firstLine = content.split('\n').find((l) => l.trim().length > 0) ?? ''
    return firstLine.slice(0, 120)
  }
}

function AssistantMessage({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  const summary = summariseAssistant(content)
  return (
    <div style={assistantBubble}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, fontSize: 12 }}>{summary}</span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={toggleBtn}
        >{expanded ? 'Hide output' : 'Show output'}</button>
      </div>
      {expanded && (
        <pre style={rawBlock}>{content}</pre>
      )}
    </div>
  )
}

export function BuilderChat({ history, pending, onSend }: Props) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when history grows or pending toggles.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [history.length, pending])

  const send = useCallback(() => {
    const text = input.trim()
    if (!text || pending) return
    onSend(text)
    setInput('')
  }, [input, pending, onSend])

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+Enter to send.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      send()
    }
  }, [send])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {history.length === 0 && (
          <div style={{ color: 'var(--text-color-subtle)', fontSize: 12, padding: 12 }}>
            Describe what you want the extension to do. Cmd+Enter (or Ctrl+Enter) to send.
          </div>
        )}
        {history.map((m, i) => (
          m.role === 'user' ? (
            <div key={i} data-role="user" style={userBubble}>{m.content}</div>
          ) : (
            <AssistantMessage key={i} content={m.content} />
          )
        ))}
        {pending && (
          <div style={{ alignSelf: 'flex-start', fontSize: 11, color: 'var(--text-color-subtle)', padding: '6px 10px' }}>
            generating…
          </div>
        )}
      </div>
      <div style={{ borderTop: '1px solid var(--border-color-default)', padding: 8 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Describe the extension you want to build…"
          rows={3}
          disabled={pending}
          aria-label="message"
          style={{
            width: '100%', resize: 'vertical',
            background: 'var(--bg-app, var(--color-panel))', color: 'var(--text-color-default)',
            border: '1px solid var(--border-color-default)', borderRadius: 4,
            padding: 8, font: 'inherit', fontSize: 12,
            opacity: pending ? 0.5 : 1,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            type="button"
            onClick={send}
            disabled={pending || !input.trim()}
            style={{
              background: 'rgb(99 102 241)', color: 'white', border: 'none',
              borderRadius: 4, padding: '6px 12px', cursor: pending ? 'not-allowed' : 'pointer',
              font: 'inherit', fontSize: 12,
              opacity: pending || !input.trim() ? 0.5 : 1,
            }}
          >Send</button>
        </div>
      </div>
    </div>
  )
}

const userBubble: React.CSSProperties = {
  alignSelf: 'flex-end',
  background: 'rgb(99 102 241 / 25%)',
  border: '1px solid var(--border-color-default)',
  borderRadius: 8,
  padding: '6px 10px',
  maxWidth: '85%',
  fontSize: 12,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}

const assistantBubble: React.CSSProperties = {
  alignSelf: 'flex-start',
  background: 'var(--color-elev)',
  border: '1px solid var(--border-color-default)',
  borderRadius: 8,
  padding: '6px 10px',
  maxWidth: '85%',
  fontSize: 12,
  wordBreak: 'break-word',
}

const toggleBtn: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--text-color-muted)',
  border: '1px solid var(--border-color-default)',
  borderRadius: 4,
  padding: '2px 6px',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 11,
}

const rawBlock: React.CSSProperties = {
  marginTop: 6,
  background: 'var(--bg-app, var(--color-panel))',
  color: 'var(--text-color-default)',
  border: '1px solid var(--border-color-default)',
  borderRadius: 4,
  padding: 8,
  fontSize: 11,
  maxHeight: 400,
  overflow: 'auto',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}
