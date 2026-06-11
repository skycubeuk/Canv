import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Sparkles, ArrowRight } from 'lucide-react'
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
import type { ToolCall, ToolResult, TokenUsage } from '../adapters/types'
import type { WritePreview, ApprovalDecision } from '../agents/chatRunner'
import { ChatToolChip } from './ChatToolChip'
import { ChatApprovalCard, type ApprovalState } from './ChatApprovalCard'
import { isMcpToolName } from '../agents/mcp'
import { ChatTodoCard } from './ChatTodoCard'
import { ChatRetryActions, type RetryActionKind } from './ChatRetryActions'
import { getTool } from '../tools/registry'
import { ChatSessionsSidebar, type SidebarSession } from './ChatSessionsSidebar'
import { useAtMention } from '../hooks/useAtMention'
import { AtMentionPopover } from './chat/AtMentionPopover'

// Stable reference for the no-workspace case so useAtMention's memo input
// doesn't change identity every render.
const EMPTY_FILES: string[] = []

export type ChatProvider = 'anthropic' | 'openai' | 'ollama'

export type FailureReason = 'cancelled' | 'provider_error' | 'refusal'

export interface ErrorInfo {
  kind: 'network' | 'rate_limited' | 'server' | 'schema' | 'unknown'
  statusCode?: number
  message: string
  /** Seconds; honoured by Retry button countdown when set (typically from a 429). */
  retryAfter?: number
}

function errorKindLabel(kind: ErrorInfo['kind']): string {
  switch (kind) {
    case 'network': return 'Network error'
    case 'rate_limited': return 'Rate limited'
    case 'server': return 'Server error'
    case 'schema': return 'API error'
    default: return 'Error'
  }
}

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
  /** Provider-reported terminal reason for this turn. Mirrors the provider's
   *  own value; for failures, see `failureReason`. */
  stopReason?: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'
  /** Why this message ended in a recoverable failure state. Used by A3 to
   *  drive inline retry affordances. */
  failureReason?: FailureReason
  /** Populated when `failureReason === 'provider_error'`. */
  errorInfo?: ErrorInfo
  /** Populated when `failureReason === 'refusal'` (Claude Fable 5 safety
   *  classifiers). Both fields can be null. */
  refusal?: { category: string | null; explanation: string | null }
  /** Provider-opaque thinking blocks from this assistant turn. Passed back
   *  verbatim to the provider on later requests; never rendered. */
  thinkingBlocks?: unknown[]
  /** Token counts reported by the model for this assistant turn. */
  tokenUsage?: TokenUsage
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
  /** Retry handler: anchorId is the message the action was attached to
   *  (a failed assistant message, or an earlier user/assistant message). */
  onRetry: (anchorId: string) => void
  /** Edit-and-retry handler: takes the new text for the most-recent user
   *  message. The chat panel itself owns the inline editor UI; App.tsx just
   *  receives the final text on submit. */
  onEditAndRetry: (newText: string) => void
  pendingApprovals?: Map<string, PendingApproval>
  onApprovalDecide?: (callId: string, decision: ApprovalDecision) => void
  pricingOverrides: Record<string, ModelPricing>
  followLatest: boolean
  onSetFollowLatest: (next: boolean) => void
  contextFileName: string | null
  /** Base px size for chat text. Bubbles render at 1em; chrome scales
   *  proportionally via em-relative classes. */
  chatFontSize: number
  /** Controlled input value (the unsent draft). The parent owns this so the
   *  draft survives ChatPanel remounts and persists per-session. */
  draft: string
  onDraftChange: (next: string) => void
  sessions: SidebarSession[]
  activeId: string
  onCreateSession: () => void
  onSelectSession: (id: string) => void
  onCloseSession: (id: string) => void
  onChangeProviderModel: (provider: ChatProvider, model: string) => void
  availableModels: Record<ChatProvider, string[]>
  /** Workspace files (forward-slash relative paths) shown by the @-mention
   *  picker. Empty when no workspace is mounted. */
  workspaceFiles?: string[]
}

export function ChatPanel({ messages, busy, provider, model, onSend, onClear, onStop, onRetry, onEditAndRetry, pendingApprovals, onApprovalDecide, pricingOverrides, followLatest, onSetFollowLatest, contextFileName, chatFontSize, draft, onDraftChange, sessions, activeId, onCreateSession, onSelectSession, onCloseSession, onChangeProviderModel, availableModels, workspaceFiles }: Props) {
  // Draft is controlled by the parent (useChatSessions) so it survives any
  // remount of this component — e.g. toggling the files sidebar used to
  // unmount the entire main column and drop a local useState here.
  const input = draft
  const setInput = onDraftChange
  const mention = useAtMention(workspaceFiles ?? EMPTY_FILES)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dialogs = useDialogs()
  const ctxMenu = useContextMenu()
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const lastUserId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i].id
    }
    return null
  }, [messages])

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

  useEffect(() => {
    const handler = (e: Event) => {
      const prompt = (e as CustomEvent<string>).detail
      if (typeof prompt !== 'string') return
      onDraftChange(prompt)
      const el = inputRef.current
      if (el) {
        el.focus()
        el.setSelectionRange(prompt.length, prompt.length)
      }
    }
    window.addEventListener('canv:setChatDraft', handler)
    return () => window.removeEventListener('canv:setChatDraft', handler)
  }, [onDraftChange])

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
    // Parent (useChatSessions.sendChat) clears the draft when the send
    // actually proceeds. If it bails early (missing API key, no workspace),
    // the draft is intentionally preserved so the user doesn't lose work.
    onSend(text)
  }

  const onScrollKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'r' && e.key !== 'R') return
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'TEXTAREA' || tag === 'INPUT') return
    e.preventDefault()
    // Walk back to find the most recent failed/cancelled/denied-tool message;
    // locate its primary Retry button by data-attribute and focus it.
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.failureReason || m.toolResults?.some((r) => r.isUserDenial)) {
        const btn = scrollRef.current?.querySelector<HTMLButtonElement>(
          `[data-msg-id="${CSS.escape(m.id)}"] [data-retry-primary]`,
        )
        btn?.scrollIntoView({ block: 'nearest' })
        btn?.focus()
        return
      }
    }
  }

  const locked = messages.length > 0

  return (
    <div className="h-full flex min-h-0" style={{ fontSize: `${chatFontSize}px` }}>
      <ChatSessionsSidebar
        sessions={sessions}
        activeId={activeId}
        onCreate={onCreateSession}
        onSelect={onSelectSession}
        onClose={onCloseSession}
      />
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-default text-[0.85em] text-muted">
        <FileText aria-hidden className="w-2.5 h-2.5" />
        <span className="text-default truncate">{contextFileName ?? 'No active document'}</span>
        {contextFileName && (
          <span className="px-1.5 py-px rounded-sm text-[0.75em] font-medium bg-accent-soft text-accent">
            shared
          </span>
        )}
        <select
          aria-label="Provider"
          title={locked ? `Locked to ${provider}/${model} for this chat — open a new chat to use a different model` : 'Provider for this chat'}
          className="input text-xs px-1 py-0.5 w-auto disabled:opacity-60"
          disabled={locked}
          value={provider}
          onChange={(e) => {
            const p = e.target.value as ChatProvider
            const firstModel = availableModels[p]?.[0] ?? model
            onChangeProviderModel(p, firstModel)
          }}
        >
          {(Object.keys(availableModels) as ChatProvider[]).map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          aria-label="Model"
          title={locked ? `Locked to ${model}` : 'Model for this chat'}
          className="input text-xs px-1 py-0.5 w-auto disabled:opacity-60"
          disabled={locked}
          value={model}
          onChange={(e) => onChangeProviderModel(provider as ChatProvider, e.target.value)}
        >
          {(availableModels[provider as ChatProvider] ?? [model]).map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
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
            className="text-[0.85em] text-muted hover:text-default"
            disabled={busy}
          >
            Clear
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        data-testid="chat-message-list"
        role="log"
        tabIndex={0}
        onKeyDown={onScrollKeyDown}
        className="relative flex-1 overflow-y-auto px-4 py-4 space-y-3"
      >
        {messages.length === 0 && (
          <div className="text-[1em] text-muted text-center py-8">
            Ask anything about the document.<br />
            Try: <em>"Summarise this in one sentence"</em> or <em>"What's missing from the argument?"</em>
          </div>
        )}
        {messages.map((m, i) => {
          const isLatestAssistant = m.role === 'assistant' && i === messages.length - 1
          return (
            <Bubble
              key={m.id}
              message={m}
              pendingApprovals={pendingApprovals}
              onApprovalDecide={onApprovalDecide}
              busy={busy}
              onRetry={onRetry}
              onEditAndRetry={onEditAndRetry}
              isLatestAssistant={isLatestAssistant}
              editing={editingUserId === m.id}
              onBeginEdit={() => { if (lastUserId) setEditingUserId(lastUserId) }}
              onCancelEdit={() => setEditingUserId(null)}
              onSubmitEdit={(text) => { setEditingUserId(null); onEditAndRetry(text) }}
            />
          )
        })}
        {!followLatest && (
          <button
            type="button"
            onClick={jumpToLatest}
            className="sticky bottom-2 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1 rounded-full border border-default bg-elev px-3 py-1 text-[0.85em] text-muted shadow-lg hover:text-default"
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

      <div
        className="shrink-0 p-2.5 bg-app"
        onMouseDown={(e) => {
          if ((e.target as Element).closest('button, textarea, input, select, a, [role="button"]')) return
          e.preventDefault()
          inputRef.current?.focus()
        }}
      >
        <div className="relative bg-elev border border-default rounded-[10px] p-2 cursor-text">
          {mention.state.active && (
            <AtMentionPopover
              suggestions={mention.state.suggestions}
              highlight={mention.state.highlight}
              onPick={(i) => {
                const el = inputRef.current
                if (!el) return
                const result = mention.pick(input, el.selectionStart ?? input.length, i)
                if (!result) return
                setInput(result.nextText)
                requestAnimationFrame(() => {
                  el.focus()
                  el.setSelectionRange(result.nextCaret, result.nextCaret)
                })
                mention.close()
              }}
              onHover={(i) => mention.moveHighlight(i - mention.state.highlight)}
            />
          )}
          <AutoGrowTextarea
            ref={inputRef}
            data-testid="chat-input"
            value={input}
            onChange={(e) => {
              const v = e.target.value
              setInput(v)
              mention.sync(v, e.target.selectionStart ?? v.length)
            }}
            onSelect={(e) => {
              const el = e.currentTarget
              mention.sync(el.value, el.selectionStart ?? el.value.length)
            }}
            onBlur={() => mention.close()}
            onKeyDown={(e) => {
              if (mention.state.active && mention.state.suggestions.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  mention.moveHighlight(1)
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  mention.moveHighlight(-1)
                  return
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  const el = inputRef.current
                  if (!el) return
                  const result = mention.pick(input, el.selectionStart ?? input.length)
                  if (result) {
                    e.preventDefault()
                    setInput(result.nextText)
                    requestAnimationFrame(() => {
                      el.focus()
                      el.setSelectionRange(result.nextCaret, result.nextCaret)
                    })
                    mention.close()
                    return
                  }
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  mention.close()
                  return
                }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            onContextMenu={onInputContextMenu}
            placeholder="Message the document…"
            minRows={2}
            maxRows={6}
            className="w-full bg-transparent border-none focus:outline-hidden text-[1em] text-default placeholder:text-subtle resize-none px-1 pb-2"
          />
          <div className="flex items-center gap-1.5">
            <div className="flex-1" />
            {busy ? (
              <button
                type="button"
                onClick={onStop}
                className="text-[0.75em] px-2 py-1 rounded-sm text-muted hover:text-default"
              >
                Stop
              </button>
            ) : (
              <>
                <span className="text-[0.75em] text-subtle">⏎ to send</span>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                  aria-label="Send message"
                  className="w-6 h-6 grid place-items-center rounded-sm bg-accent text-accent-fg disabled:opacity-50 hover:opacity-90"
                >
                  <ArrowRight aria-hidden className="w-3 h-3" />
                </button>
              </>
            )}
          </div>
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
  busy,
  onRetry,
  onEditAndRetry,
  isLatestAssistant,
  editing,
  onBeginEdit,
  onCancelEdit,
  onSubmitEdit,
}: {
  message: ChatMessage
  pendingApprovals?: Map<string, PendingApproval>
  onApprovalDecide?: (callId: string, decision: ApprovalDecision) => void
  busy?: boolean
  onRetry?: (anchorId: string) => void
  onEditAndRetry?: (newText: string) => void
  /** True only for the most recent assistant message; suppresses the
   *  hover-only "Retry from here" earlier-anchor. */
  isLatestAssistant?: boolean
  editing?: boolean
  onBeginEdit?: () => void
  onCancelEdit?: () => void
  onSubmitEdit?: (text: string) => void
}) {
  const isUser = message.role === 'user'
  const ctxMenu = useContextMenu()
  const ref = useRef<HTMLDivElement>(null)
  const isFailed = !!message.failureReason
  const isDeniedTool = !isFailed && message.role === 'assistant'
    && !!message.toolResults?.some((r) => r.isUserDenial)
  const showEarlierAnchor = !!onRetry && !isFailed && !isDeniedTool && !isLatestAssistant && !editing
  const earlierAnchor = showEarlierAnchor ? (
    <div className="chat-bubble-earlier-anchor mt-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
      <ChatRetryActions
        kind="earlier-anchor"
        disabled={!!busy}
        disabledReason="Stop the current run first"
        onRetry={() => onRetry?.(message.id)}
      />
    </div>
  ) : null
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
      <div className="group flex flex-col items-end" data-msg-id={message.id}>
        <div
          ref={ref}
          onContextMenu={onContextMenu}
          className="max-w-[85%] px-3 py-2 text-[1em] whitespace-pre-wrap leading-relaxed bg-accent text-accent-fg"
          style={{ borderRadius: '14px 14px 4px 14px' }}
        >
          {editing ? (
            <UserEditMode
              initial={message.content}
              onSubmit={(text) => onSubmitEdit?.(text)}
              onCancel={() => onCancelEdit?.()}
            />
          ) : (
            message.content
          )}
        </div>
        {earlierAnchor}
      </div>
    )
  }

  return (
    <div className="group flex gap-2 items-start" data-msg-id={message.id}>
      <div
        aria-hidden
        className="w-[22px] h-[22px] shrink-0 rounded-md grid place-items-center bg-elev border border-default text-accent"
      >
        <Sparkles className="w-2.5 h-2.5" />
      </div>
      <div className="flex flex-col min-w-0 max-w-[85%]">
      <div
        ref={ref}
        onContextMenu={onContextMenu}
        className="px-3 py-2 text-[1em] leading-[1.55] bg-elev text-default border border-default whitespace-pre-wrap"
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
              // MCP tools aren't in the native registry (separate surface) but
              // they always need approval — render the same approval card for
              // either a mutating native tool or any MCP call.
              if ((tool?.mutating || isMcpToolName(call.name)) && pending && onApprovalDecide) {
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

        {!message.content && !message.toolCalls && !message.failureReason && (
          <span className="streaming-cursor"> </span>
        )}

        {message.failureReason === 'cancelled' && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-default bg-elev px-2 py-0.5 text-[0.75em] uppercase tracking-wide text-muted">
            Stopped
          </div>
        )}

        {message.failureReason === 'refusal' && (
          <div className="mt-2 rounded-md border border-default bg-elev px-2 py-1.5 text-[0.92em] text-default">
            <div className="flex items-center gap-1.5 text-[0.75em] uppercase tracking-wide text-muted">
              <span>Declined by model</span>
              {message.refusal?.category && (
                <span className="font-mono text-subtle">{message.refusal.category}</span>
              )}
            </div>
            <p className="mt-0.5 leading-snug whitespace-pre-wrap wrap-break-word">
              {message.refusal?.explanation
                ?? 'The model’s safety classifiers declined this request. Retry with a different model.'}
            </p>
          </div>
        )}

        {message.failureReason === 'provider_error' && message.errorInfo && (
          <div className="mt-2 rounded-md border border-default bg-elev px-2 py-1.5 text-[0.92em] text-default">
            <div className="flex items-center gap-1.5 text-[0.75em] uppercase tracking-wide text-muted">
              <span>{errorKindLabel(message.errorInfo.kind)}</span>
              {message.errorInfo.statusCode != null && (
                <span className="font-mono text-subtle">{message.errorInfo.statusCode}</span>
              )}
            </div>
            <p className="mt-0.5 leading-snug whitespace-pre-wrap wrap-break-word">
              {message.errorInfo.message}
            </p>
          </div>
        )}

        {(() => {
          if (!onRetry || !onEditAndRetry) return null
          const isFailed = !!message.failureReason
          const hasDeniedTool = !isFailed && message.role === 'assistant'
            && message.toolResults?.some((r) => r.isUserDenial)
          if (!isFailed && !hasDeniedTool) return null
          const kind: RetryActionKind = hasDeniedTool ? 'denied-tool' : 'cancelled-or-error'
          return (
            <ChatRetryActions
              kind={kind}
              disabled={!!busy}
              disabledReason="Stop the current run first"
              retryAfterSeconds={message.errorInfo?.retryAfter}
              onRetry={() => onRetry(message.id)}
              onEditAndRetry={() => onBeginEdit?.()}
              primaryDataAttr="retry-primary"
            />
          )
        })()}
      </div>
      {earlierAnchor}
      </div>
    </div>
  )
}

function UserEditMode({ initial, onSubmit, onCancel }: {
  initial: string
  onSubmit: (text: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(initial)
  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      onSubmit(text.trim())
    }
  }
  return (
    <div className="chat-user-edit flex flex-col gap-2">
      <textarea
        aria-label="Edit prompt"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        autoFocus
        className="w-full bg-elev text-default border border-default rounded-md p-2 text-[1em] resize-y min-h-[64px]"
      />
      <div className="chat-user-edit-actions flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onSubmit(text.trim())}
          className="btn-primary btn-sm"
        >
          Submit
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn-ghost btn-sm"
        >
          Cancel
        </button>
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
