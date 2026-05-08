import { useState, useMemo, useRef, useCallback, type ReactNode } from 'react'
import { MessageSquare, ChevronDown, ChevronRight, X, RotateCw, CircleHelp } from 'lucide-react'
import { computeDiff } from '../lib/diff'
import { parseAgentResponse } from '../agents/runner'
import type { Action as AgentDef } from '../config/types'
import { useModes, getModeById, getActionById } from '../hooks/useModes'
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
import { ChatPanel, Bubble, type ChatMessage } from './ChatPanel'
import { timeAgo } from '../lib/timeAgo'
import type { Message, TokenUsage } from '../adapters/types'
import { providerName } from '../adapters'

export const CHAT_TAB_ID = '__chat__'

export interface RunFollowup {
  user: string
  assistant: string
  tokenUsage?: TokenUsage
  elapsedMs?: number
}

export interface RunRecord {
  id: string
  agentId: string
  agentLabel: string
  /** The mode the run was triggered from. Older records may lack this; renderers fall back to the active mode. */
  modeId?: string
  // agentIcon removed — render sites look up via getAgent
  model: string
  provider: string
  sourceText: string
  range: { from: number; to: number } | null
  response: string
  status: 'streaming' | 'done' | 'error' | 'refining' | 'aborted'
  error?: string
  timestamp: number
  basePrompt?: string
  originalResponse?: string
  followups?: RunFollowup[]
  truncated?: boolean
  /** Full messages array sent to the adapter for this run (or its latest refine). */
  rawMessages?: Message[]
  /** System prompt sent (refines only — initial runs don't pass system separately). */
  system?: string
  /** Token usage reported by the adapter for the most recent call. */
  tokenUsage?: TokenUsage
  /** Wall-clock duration in milliseconds for the most recent call. */
  elapsedMs?: number
  /** 2 = ranges are CodeMirror character offsets. Older runs have no
   *  schemaVersion (or 1) and their `range` is a ProseMirror position
   *  from the legacy Tiptap editor — Apply must stay disabled for them. */
  schemaVersion?: 2
}

interface ChatBundle {
  enabled: boolean
  messages: ChatMessage[]
  busy: boolean
  provider: string
  model: string
  onSend: (text: string) => void
  onClear: () => void
  onStop: () => void
  onRetry: (anchorId: string) => void
  onEditAndRetry: (newText: string) => void
  onCloseChat: () => void
  pricingOverrides: Record<string, import('../config/pricing').ModelPricing>
}

interface Props {
  runs: RunRecord[]
  activeId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onApply: (run: RunRecord, text: string) => void
  onRerun: (run: RunRecord) => void
  onRefine: (run: RunRecord, message: string) => void
  chat: ChatBundle
}

export function ResultsPanel(props: Props) {
  const { runs, activeId, onSelect, onClose, onApply, onRerun, onRefine, chat } = props
  const { modes, defaultModeId } = useModes()
  const [followLatest, setFollowLatest] = useState(true)
  const handleSetFollowLatest = useCallback((next: boolean) => setFollowLatest(next), [])

  if (runs.length === 0 && !chat.enabled) return null

  const chatActive = chat.enabled && (activeId === CHAT_TAB_ID || (activeId === null && runs.length === 0))
  const activeRun = !chatActive ? runs.find((r) => r.id === activeId) ?? runs[0] : undefined

  return (
    <div className="flex flex-col h-full bg-panel border-l border-default">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-default px-2 py-1.5">
        {chat.enabled && (
          <button
            key={CHAT_TAB_ID}
            type="button"
            onClick={() => onSelect(CHAT_TAB_ID)}
            className={`group flex items-center gap-1.5 px-2.5 py-1 rounded text-xs whitespace-nowrap transition-colors ${
              chatActive
                ? 'bg-active text-default'
                : 'hover:bg-hover text-muted'
            }`}
          >
            <MessageSquare aria-hidden className="w-4 h-4" />
            <span className="font-medium">Chat</span>
            {chat.messages.length > 0 && (
              <span className="text-subtle">· {chat.messages.length}</span>
            )}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                chat.onCloseChat()
              }}
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 ml-1"
              aria-label="Close chat"
            >
              <X aria-hidden className="w-3 h-3" />
            </span>
          </button>
        )}

        {runs.map((r) => {
          const mode = getModeById(modes, r.modeId) ?? getModeById(modes, defaultModeId)
          const RunIcon = (mode ? getActionById(mode, r.agentId)?.icon : undefined) ?? CircleHelp
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect(r.id)}
              className={`group flex items-center gap-1.5 px-2.5 py-1 rounded text-xs whitespace-nowrap transition-colors ${
                r.id === activeRun?.id
                  ? 'bg-active text-default'
                  : 'hover:bg-hover text-muted'
              }`}
            >
              <RunIcon aria-hidden className="w-4 h-4" />
              <span className="font-medium">{r.agentLabel}</span>
              <span className="text-subtle">· {timeAgo(r.timestamp)}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(r.id)
                }}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 ml-1"
                aria-label="Close tab"
              >
                <X aria-hidden className="w-3 h-3" />
              </span>
            </button>
          )
        })}
      </div>

      {chatActive ? (
        <ChatPanel
          messages={chat.messages}
          busy={chat.busy}
          provider={chat.provider}
          model={chat.model}
          onSend={chat.onSend}
          onClear={chat.onClear}
          onStop={chat.onStop}
          onRetry={chat.onRetry}
          onEditAndRetry={chat.onEditAndRetry}
          pricingOverrides={chat.pricingOverrides}
          followLatest={followLatest}
          onSetFollowLatest={handleSetFollowLatest}
          contextFileName={null}
        />
      ) : activeRun ? (
        <RunView run={activeRun} onApply={onApply} onRerun={onRerun} onRefine={onRefine} />
      ) : null}
    </div>
  )
}

export function RunView({
  run,
  onApply,
  onRerun,
  onRefine,
}: {
  run: RunRecord
  onApply: (run: RunRecord, text: string) => void
  onRerun: (run: RunRecord) => void
  onRefine: (run: RunRecord, message: string) => void
}) {
  const [sourceOpen, setSourceOpen] = useState(false)
  const [refineText, setRefineText] = useState('')

  const ctxMenu = useContextMenu()
  const refineRef = useRef<HTMLTextAreaElement>(null)
  const responseRef = useRef<HTMLDivElement>(null)

  const onRefineContextMenu = (e: React.MouseEvent) => {
    const el = refineRef.current
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

  const onResponseContextMenu = (e: React.MouseEvent) => {
    const root = responseRef.current
    if (!root) return
    const hasSel = (window.getSelection()?.toString().length ?? 0) > 0
    const items: ContextMenuItem[] = [
      { id: 'copy', label: 'Copy', disabled: !hasSel, onClick: () => { void copyFromDom() } },
      { separator: true },
      { id: 'select-all', label: 'Select all', onClick: () => selectAllInDom(root) },
    ]
    ctxMenu.open(e, items)
  }

  const { modes, defaultModeId } = useModes()
  const agent = useMemo<AgentDef | null>(() => {
    const mode = getModeById(modes, run.modeId) ?? getModeById(modes, defaultModeId)
    if (!mode) return null
    return getActionById(mode, run.agentId) ?? null
  }, [modes, defaultModeId, run.modeId, run.agentId])

  const parsed = useMemo(() => {
    if (!agent) return { rewrite: run.response, raw: run.response }
    return parseAgentResponse(agent, run.response)
  }, [agent, run.response])

  const busy = run.status === 'streaming' || run.status === 'refining'
  const refineCount = run.followups?.length ?? 0
  const canRefine = !!run.basePrompt

  function submitRefine() {
    const text = refineText.trim()
    if (!text || busy) return
    onRefine(run, text)
    setRefineText('')
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div ref={responseRef} onContextMenu={onResponseContextMenu} className="flex-1 overflow-y-auto">
      <div className="px-4 py-3 border-b border-default flex items-center justify-between">
        <div className="text-xs text-muted flex items-center gap-2">
          <StatusPill status={run.status} />
          <span>{providerName(run.provider)} · {run.model}</span>
          {refineCount > 0 && (
            <span className="text-subtle">· refined {refineCount}×</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onRerun(run)}
            className="btn-ghost text-xs"
            disabled={busy}
            title="Re-run"
          >
            <span className="inline-flex items-center gap-1">
              <RotateCw aria-hidden className="w-3 h-3" />
              Re-run
            </span>
          </button>
        </div>
      </div>

      {run.sourceText && (
        <div className="border-b border-default">
          <button
            type="button"
            onClick={() => setSourceOpen((v) => !v)}
            className="w-full px-4 py-2 text-left text-xs text-muted hover:bg-hover"
          >
            <span className="inline-flex items-center gap-1">
              {sourceOpen ? <ChevronDown aria-hidden className="w-3 h-3" /> : <ChevronRight aria-hidden className="w-3 h-3" />}
              Source ({run.sourceText.length} chars)
            </span>
          </button>
          {sourceOpen && (
            <div className="px-4 pb-3 text-sm text-muted whitespace-pre-wrap font-serif">
              {run.sourceText}
            </div>
          )}
        </div>
      )}

      {run.status === 'error' && (
        <div className="px-4 py-3 m-3 bg-red-950/30 border border-red-900 rounded text-sm text-red-300">
          {run.error || 'Something went wrong.'}
        </div>
      )}

      {run.status === 'aborted' && (
        <div className="px-4 py-3 m-3 bg-elev border border-default rounded text-sm text-muted">
          Stopped. The partial output above is what was streamed before you cancelled.
        </div>
      )}

      {run.truncated && run.status !== 'error' && !busy && (
        <div className="px-4 py-3 m-3 bg-amber-950/30 border border-amber-900 rounded text-sm text-amber-200">
          <strong>Response was cut short.</strong> The model hit the output token
          limit before finishing. Raise <em>Max output tokens</em> in settings, or
          split the selection into smaller chunks. The result below is incomplete —
          review carefully before applying.
        </div>
      )}

      {parsed.feedback && (
        <Section title={agent?.outputMode === 'feedback-only' && agent.id === 'summarise' ? 'Summary' : 'Notes'}>
          <div className="text-sm whitespace-pre-wrap leading-relaxed">{parsed.feedback}</div>
          {agent?.outputMode === 'feedback-only' && !busy && (
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigator.clipboard.writeText(parsed.feedback!)}
              >
                Copy
              </button>
            </div>
          )}
        </Section>
      )}

      {parsed.rewrite && agent?.outputMode !== 'feedback-only' && (
        <Section title={parsed.feedback ? 'Suggested rewrite' : 'Result'}>
          <div className={`text-sm whitespace-pre-wrap leading-relaxed font-serif ${busy ? 'streaming-cursor' : ''}`}>
            {parsed.rewrite}
          </div>

          {run.sourceText && parsed.rewrite && !busy && (
            <DiffView original={run.sourceText} updated={parsed.rewrite} />
          )}

          {!busy && parsed.rewrite && (
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                className="btn-primary"
                onClick={() => onApply(run, parsed.rewrite!)}
                disabled={run.schemaVersion !== 2}
                title={
                  run.schemaVersion !== 2
                    ? 'Run was created with the previous editor — re-run to apply'
                    : run.range
                      ? 'Replace selection with this text'
                      : 'Replace the entire document with this text'
                }
              >
                Apply
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigator.clipboard.writeText(parsed.rewrite!)}
              >
                Copy
              </button>
            </div>
          )}
        </Section>
      )}

      {!parsed.feedback && !parsed.rewrite && busy && (
        <Section title="Working…">
          <div className="text-sm streaming-cursor"> </div>
        </Section>
      )}

      {run.followups && run.followups.length > 0 && (
        <Section title="Refinements">
          <div className="space-y-3">
            {run.followups.map((f, i) => (
              <div key={i} className="space-y-2">
                <Bubble message={{ id: `${run.id}-followup-${i}-user`, role: 'user', content: f.user }} />
                <Bubble message={{ id: `${run.id}-followup-${i}-assistant`, role: 'assistant', content: f.assistant }} />
                {(f.tokenUsage || f.elapsedMs != null) && (
                  <div className="text-[10px] text-subtle pl-1">
                    {f.tokenUsage && (
                      <span>{f.tokenUsage.input ?? '?'}+{f.tokenUsage.output ?? '?'} tok</span>
                    )}
                    {f.tokenUsage && f.elapsedMs != null && <span> · </span>}
                    {f.elapsedMs != null && <span>{(f.elapsedMs / 1000).toFixed(1)}s</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
      </div>

      {canRefine && run.status !== 'error' && (
        <div className="border-t border-default px-3 py-2 bg-panel/60">
          <div className="flex items-end gap-2">
            <AutoGrowTextarea
              ref={refineRef}
              value={refineText}
              onChange={(e) => setRefineText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submitRefine()
                }
              }}
              onContextMenu={onRefineContextMenu}
              placeholder={busy ? 'Working…' : 'Discuss or refine this edit (e.g. "softer tone, keep the comma")'}
              disabled={busy}
              minRows={2}
              maxRows={6}
              className="flex-1 resize-none px-3 py-2 text-sm rounded-md border border-default bg-elev focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
            />
            <button
              type="button"
              onClick={submitRefine}
              disabled={busy || !refineText.trim()}
              className="btn-primary text-sm disabled:opacity-50"
              title="Send refinement (Enter)"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-4 py-3 border-b border-default">
      <h3 className="text-xs uppercase tracking-wide text-muted mb-2">{title}</h3>
      {children}
    </div>
  )
}

function DiffView({ original, updated }: { original: string; updated: string }) {
  const parts = useMemo(() => computeDiff(original, updated), [original, updated])
  return (
    <details className="mt-3">
      <summary className="text-xs text-muted cursor-pointer hover:text-default">
        Show diff
      </summary>
      <div className="mt-2 p-3 bg-panel rounded text-sm font-serif whitespace-pre-wrap leading-relaxed">
        {parts.map((p, i) => {
          if (p.added) {
            return (
              <span key={i} className="bg-green-900/40 text-green-200">
                {p.value}
              </span>
            )
          }
          if (p.removed) {
            return (
              <span key={i} className="bg-red-900/40 text-red-200 line-through">
                {p.value}
              </span>
            )
          }
          return <span key={i}>{p.value}</span>
        })}
      </div>
    </details>
  )
}

const STATUS_PILL: Record<RunRecord['status'], { label: string; className: string }> = {
  streaming: { label: 'Streaming', className: 'bg-blue-900/40 text-blue-300' },
  refining:  { label: 'Refining',  className: 'bg-purple-900/40 text-purple-300' },
  done:      { label: 'Done',      className: 'bg-green-900/40 text-green-300' },
  error:     { label: 'Error',     className: 'bg-red-900/40 text-red-300' },
  aborted:   { label: 'Stopped',   className: 'bg-neutral-700/60 text-neutral-300' },
}

export function StatusPill({ status }: { status: RunRecord['status'] }) {
  const { label, className } = STATUS_PILL[status]
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide ${className}`}>
      {label}
    </span>
  )
}
