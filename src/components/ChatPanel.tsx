import { useEffect, useRef, useState } from 'react'
import { useDialogs } from '../lib/dialogs'
import { AutoGrowTextarea } from './AutoGrowTextarea'
import { useContextMenu, type ContextMenuItem } from '../lib/contextMenu'
import {
  cutFromTextarea,
  copyFromTextarea,
  pasteIntoTextarea,
  selectAllInTextarea,
  copyFromDom,
  selectAllInDom,
} from '../lib/contextMenuActions'
import type { ToolCall, ToolResult } from '../adapters/types'
import type { WritePreview, ApprovalDecision } from '../agents/chatRunner'
import { ChatToolChip } from './ChatToolChip'
import { ChatApprovalCard, type ApprovalState } from './ChatApprovalCard'
import { ChatTodoCard } from './ChatTodoCard'
import { getTool } from '../tools/registry'

export type ChatProvider = 'anthropic' | 'openai'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Set on the first user message; locks the chat to this provider. */
  provider?: ChatProvider
  /** Tool calls the assistant emitted in this round. */
  toolCalls?: ToolCall[]
  /** Tool results returned to the model after this assistant round. */
  toolResults?: ToolResult[]
  /** Marks a system-injected synthetic note (e.g. "(turn cancelled)"). */
  synthetic?: boolean
  /** Why this message terminated, when it ended on something other than a
   *  clean end_turn. 'cancelled' means the user clicked Stop; rendered as
   *  a "Stopped" pill, and used by A3 as the anchor for retry actions. */
  stopReason?: 'cancelled'
}

export interface PendingApproval {
  callId: string
  preview: WritePreview
  state: ApprovalState
}

interface Props {
  messages: ChatMessage[]
  busy: boolean
  provider: string
  model: string
  onSend: (text: string) => void
  onClear: () => void
  onStop: () => void
  pendingApprovals?: Map<string, PendingApproval>
  onApprovalDecide?: (callId: string, decision: ApprovalDecision) => void
}

export function ChatPanel({ messages, busy, provider, model, onSend, onClear, onStop, pendingApprovals, onApprovalDecide }: Props) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const dialogs = useDialogs()
  const ctxMenu = useContextMenu()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const onInputContextMenu = (e: React.MouseEvent) => {
    const el = inputRef.current
    if (!el) return
    const hasSel = el.selectionStart !== el.selectionEnd
    const items: ContextMenuItem[] = [
      { id: 'cut', label: 'Cut', disabled: !hasSel, onClick: () => { void cutFromTextarea(el) } },
      { id: 'copy', label: 'Copy', disabled: !hasSel, onClick: () => { void copyFromTextarea(el) } },
      { id: 'paste', label: 'Paste', onClick: () => { void pasteIntoTextarea(el) } },
      { separator: true },
      { id: 'select-all', label: 'Select all', onClick: () => selectAllInTextarea(el) },
    ]
    ctxMenu.open(e, items)
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const handleSubmit = () => {
    const text = input.trim()
    if (!text || busy) return
    onSend(text)
    setInput('')
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-4 py-2 border-b border-stone-200 dark:border-neutral-800 flex items-center justify-between">
        <div className="text-xs text-stone-500 dark:text-neutral-400">
          {provider} · {model} · the document is shared with this chat
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  const ok = await dialogs.confirm({
                    title: 'Clear chat history?',
                    message: 'This will remove all messages from the current chat.',
                    confirmLabel: 'Clear',
                    danger: true,
                  })
                  if (ok) onClear()
                })()
              }}
              className="btn-ghost text-xs"
              disabled={busy}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-stone-500 dark:text-neutral-400 text-center py-8">
            Ask anything about the document.<br />
            Try: <em>"Summarise this in one sentence"</em> or <em>"What's missing from the argument?"</em>
          </div>
        )}
        {messages.map((m) => (
          <Bubble
            key={m.id}
            message={m}
            pendingApprovals={pendingApprovals}
            onApprovalDecide={onApprovalDecide}
          />
        ))}
      </div>

      <div className="border-t border-stone-200 dark:border-neutral-800 p-3">
        <div className="flex items-end gap-2">
          <AutoGrowTextarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            onContextMenu={onInputContextMenu}
            placeholder="Message the document…"
            minRows={2}
            maxRows={6}
            className="input flex-1 resize-none font-sans"
          />
          {busy ? (
            <button type="button" onClick={onStop} className="btn-secondary">
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="btn-primary disabled:opacity-50"
            >
              Send
            </button>
          )}
        </div>
        <p className="text-xs text-stone-400 mt-1.5">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  )
}

export function Bubble({
  message,
  pendingApprovals,
  onApprovalDecide,
}: {
  message: ChatMessage
  pendingApprovals?: Map<string, PendingApproval>
  onApprovalDecide?: (callId: string, decision: ApprovalDecision) => void
}) {
  const isUser = message.role === 'user'
  const ctxMenu = useContextMenu()
  const ref = useRef<HTMLDivElement>(null)
  const onContextMenu = (e: React.MouseEvent) => {
    const root = ref.current
    if (!root) return
    const hasSel = (window.getSelection()?.toString().length ?? 0) > 0
    const items: ContextMenuItem[] = [
      { id: 'copy', label: 'Copy', disabled: !hasSel, onClick: () => { void copyFromDom() } },
      { separator: true },
      { id: 'select-all', label: 'Select all', onClick: () => selectAllInDom(root) },
    ]
    ctxMenu.open(e, items)
  }
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        ref={ref}
        onContextMenu={onContextMenu}
        className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap leading-relaxed ${
          isUser
            ? 'bg-stone-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
            : 'bg-stone-100 dark:bg-neutral-800 text-stone-900 dark:text-neutral-100'
        }`}
      >
        {message.content && <span>{message.content}</span>}
        {message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {message.toolCalls.map((call) => {
              const tool = getTool(call.name)
              const result = message.toolResults?.find((r) => r.id === call.id)
              const inputPath = (call.input as { path?: string } | undefined)?.path
              const pending = pendingApprovals?.get(call.id)
              if (call.name === 'set_todos') {
                return (
                  <ChatTodoCard
                    key={call.id}
                    resultJson={result?.content}
                  />
                )
              }
              if (tool?.mutating && pending && onApprovalDecide) {
                return (
                  <ChatApprovalCard
                    key={call.id}
                    preview={pending.preview}
                    state={pending.state}
                    onDecide={(d) => onApprovalDecide(call.id, d)}
                  />
                )
              }
              const status: 'running' | 'success' | 'error' | 'cancelled' =
                !result ? 'running'
                : result.isError && result.content === 'Cancelled by user' ? 'cancelled'
                : result.isError ? 'error'
                : 'success'
              const summary = summariseResult(call.name, result?.content)
              return (
                <ChatToolChip
                  key={call.id}
                  name={call.name}
                  inputPath={inputPath}
                  status={status}
                  summary={summary}
                  result={result?.content}
                />
              )
            })}
          </div>
        )}
        {!message.content && !message.toolCalls && !isUser && <span className="streaming-cursor"> </span>}
        {message.role === 'assistant' && message.stopReason === 'cancelled' && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-stone-300 bg-stone-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-stone-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            Stopped
          </div>
        )}
      </div>
    </div>
  )
}

function summariseResult(toolName: string, content?: string): string | undefined {
  if (!content) return undefined
  if (toolName === 'read_file') {
    try {
      const parsed = JSON.parse(content) as { content?: string }
      const lines = (parsed.content ?? '').split('\n').length
      return `${lines} lines`
    } catch { return undefined }
  }
  if (toolName === 'list_dir') {
    try {
      const parsed = JSON.parse(content) as { entries?: unknown[] }
      return `${parsed.entries?.length ?? 0} entries`
    } catch { return undefined }
  }
  if (toolName === 'search_workspace') {
    try {
      const parsed = JSON.parse(content) as { matches?: unknown[]; truncated?: boolean }
      return `${parsed.matches?.length ?? 0} matches${parsed.truncated ? ' (truncated)' : ''}`
    } catch { return undefined }
  }
  return undefined
}
