import { useEffect, useRef, useState } from 'react'
import { FileText, Sparkles, ChevronDown, ArrowRight } from 'lucide-react'
import { useDialogs } from '../lib/dialogs'
import { AutoGrowTextarea } from './AutoGrowTextarea'
import { ChatMeter } from './ChatMeter'
import type { ModelPricing } from '../config/pricing'
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
  /** Token counts reported by the model for this assistant turn. */
  tokenUsage?: { input: number; output: number }
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
  pricingOverrides: Record<string, ModelPricing>
  followLatest: boolean
  onSetFollowLatest: (next: boolean) => void
  contextFileName: string | null
}

export function ChatPanel({ messages, busy, provider, model, onSend, onClear, onStop, pendingApprovals, onApprovalDecide, pricingOverrides, followLatest, onSetFollowLatest, contextFileName }: Props) {
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

  const setFollowLatest = onSetFollowLatest
  const programmaticScroll = useRef(false)

  // When messages change and we're following, scroll to bottom — and tag the
  // resulting scroll event so our handler doesn't misread it as user intent.
  // Only set the programmatic flag when there's real content (scrollHeight > 0),
  // so jsdom tests that stub geometry after mount aren't blocked by the flag.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !followLatest) return
    const hasContent = el.scrollHeight > 0
    if (hasContent) programmaticScroll.current = true
    el.scrollTo({ top: el.scrollHeight })
    const t = window.setTimeout(() => { programmaticScroll.current = false }, 80)
    return () => window.clearTimeout(t)
  }, [messages, followLatest])

  // Intent detection: user scrolling up past threshold disengages follow;
  // returning to within 8px of bottom re-engages it.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      if (programmaticScroll.current) return
      const distance = el.scrollHeight - el.clientHeight - el.scrollTop
      if (followLatest && distance > 40) setFollowLatest(false)
      else if (!followLatest && distance <= 8) setFollowLatest(true)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [followLatest, setFollowLatest])

  const jumpToLatest = () => {
    const el = scrollRef.current
    if (!el) return
    programmaticScroll.current = true
    el.scrollTo({ top: el.scrollHeight })
    setFollowLatest(true)
    window.setTimeout(() => { programmaticScroll.current = false }, 80)
  }

  const handleSubmit = () => {
    const text = input.trim()
    if (!text || busy) return
    onSend(text)
    setInput('')
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-default text-[11.5px] text-muted">
        <FileText aria-hidden className="w-2.5 h-2.5" />
        <span className="text-default truncate">{contextFileName ?? 'No active document'}</span>
        {contextFileName && (
          <span className="px-1.5 py-px rounded text-[10px] font-medium bg-accent-soft text-accent">
            shared
          </span>
        )}
        <div className="flex-1" />
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
            className="text-[11px] text-muted hover:text-default"
            disabled={busy}
          >
            Clear
          </button>
        )}
      </div>

      <div ref={scrollRef} data-testid="chat-message-list" className="relative flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-sm text-muted text-center py-8">
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
        {!followLatest && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="sticky bottom-2 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1 rounded-full border border-default bg-elev px-3 py-1 text-[11px] text-muted shadow-lg hover:text-default"
            aria-label="Jump to latest message"
          >
            ↓ jump to latest
          </button>
        )}
      </div>

      <ChatMeter
        messages={messages}
        provider={provider as ChatProvider}
        model={model}
        overrides={pricingOverrides}
        busy={busy}
      />

      <div className="shrink-0 p-2.5 bg-app">
        <div className="bg-elev border border-default rounded-[10px] p-2">
          <AutoGrowTextarea
            ref={inputRef}
            data-testid="chat-input"
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
            className="w-full bg-transparent border-none focus:outline-none text-[12.5px] text-default placeholder:text-subtle resize-none px-1 pb-2"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] border border-default text-muted hover:bg-hover"
              title="Document context shared with this chat"
            >
              <FileText aria-hidden className="w-2.5 h-2.5" />
              Document
            </button>
            <button
              type="button"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] border border-default text-muted hover:bg-hover"
              title="Active model"
            >
              <Sparkles aria-hidden className="w-2.5 h-2.5" />
              {model}
              <ChevronDown aria-hidden className="w-2 h-2" />
            </button>
            <div className="flex-1" />
            {busy ? (
              <button
                type="button"
                onClick={onStop}
                className="text-[10px] px-2 py-1 rounded text-muted hover:text-default"
              >
                Stop
              </button>
            ) : (
              <>
                <span className="text-[10px] text-subtle">⏎ to send</span>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                  aria-label="Send message"
                  className="w-6 h-6 grid place-items-center rounded bg-accent text-accent-fg disabled:opacity-50 hover:opacity-90"
                >
                  <ArrowRight aria-hidden className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
        </div>
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

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          ref={ref}
          onContextMenu={onContextMenu}
          className="max-w-[85%] px-3 py-2 text-[12.5px] whitespace-pre-wrap leading-relaxed bg-accent text-accent-fg"
          style={{ borderRadius: '14px 14px 4px 14px' }}
        >
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-2 items-start">
      <div
        aria-hidden
        className="w-[22px] h-[22px] shrink-0 rounded-md grid place-items-center bg-elev border border-default text-accent"
      >
        <Sparkles className="w-2.5 h-2.5" />
      </div>
      <div
        ref={ref}
        onContextMenu={onContextMenu}
        className="max-w-[85%] px-3 py-2 text-[12.5px] leading-[1.55] bg-elev text-default border border-default whitespace-pre-wrap"
        style={{ borderRadius: '4px 14px 14px 14px' }}
      >
        {message.content && <span>{message.content}</span>}

        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 flex flex-col gap-1">
            {message.toolCalls.map((call) => {
              const tool = getTool(call.name)
              const result = message.toolResults?.find((r) => r.id === call.id)
              const inputPath = (call.input as { path?: string } | undefined)?.path
              const pending = pendingApprovals?.get(call.id)
              if (call.name === 'set_todos') {
                return <ChatTodoCard key={call.id} resultJson={result?.content} />
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

        {!message.content && !message.toolCalls && (
          <span className="streaming-cursor"> </span>
        )}

        {message.stopReason === 'cancelled' && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-default bg-elev px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
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
