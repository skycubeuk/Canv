import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import { BottomPanel, type BottomPanelTabDef } from './BottomPanel'
import { DockPlacementMenu } from './DockPlacementMenu'
import { useDockBridge } from '../../hooks/useDockBridge'
import type { DockState, UserAction } from '../../lib/dockTypes'
import { computeDiff } from '../../lib/diff'
import { Play, MessageSquare, AlertTriangle } from 'lucide-react'
import { DialogProvider, useDialogs } from '../../lib/dialogs'
import {
  ContextMenuProvider,
  useContextMenu,
  type ContextMenuItem,
} from '../../lib/contextMenu'
import { AutoGrowTextarea } from '../AutoGrowTextarea'
import { StatusPill } from '../ResultsPanel'
import { Bubble } from '../ChatPanel'
import {
  cutFromTextarea,
  copyFromTextarea,
  pasteIntoTextarea,
  selectAllInTextarea,
  copyFromDom,
  selectAllInDom,
} from '../../lib/contextMenuActions'

export function DockPopoutBoot() {
  const bridge = useDockBridge({ mode: 'popout' })
  const [state, setState] = useState<DockState | null>(null)

  useEffect(() => {
    bridge.setStateHandler((s) => setState(s))
  }, [bridge])

  // Apply explicit-theme choices (dark / light) to the popout's <html> element.
  // 'system' is handled by the dedicated effect below.
  useEffect(() => {
    if (!state) return
    const t = state.ui.theme
    const root = document.documentElement
    if (t === 'dark') root.classList.add('dark')
    else if (t === 'light') root.classList.remove('dark')
  }, [state])

  // When theme === 'system', subscribe to prefers-color-scheme so OS dark-mode
  // toggles apply live (not only on the next state snapshot from main).
  const theme = state?.ui.theme
  useEffect(() => {
    if (theme !== 'system') return
    const m = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (matches: boolean) => {
      if (matches) document.documentElement.classList.add('dark')
      else document.documentElement.classList.remove('dark')
    }
    apply(m.matches)
    const handler = (e: MediaQueryListEvent) => apply(e.matches)
    m.addEventListener('change', handler)
    return () => m.removeEventListener('change', handler)
  }, [theme])

  const dispatch = useCallback(
    (action: UserAction) => {
      bridge.sendAction(action)
    },
    [bridge],
  )

  const tabs = useMemo<BottomPanelTabDef[]>(() => {
    if (!state) return []
    return [
      {
        id: 'runs',
        label: 'Runs',
        icon: Play,
        badge: state.runs.length || undefined,
        render: () => (
          <RunsView
            runs={state.runs}
            activeRunId={state.activeRunId}
            streamingRunId={state.streamingRunId}
            onDispatch={dispatch}
          />
        ),
      },
      {
        id: 'chat',
        label: 'Chat',
        icon: MessageSquare,
        render: () => (
          <ChatView
            messages={state.chatMessages}
            provider={state.chatProvider}
            model={state.chatModel}
            busy={state.chatBusy}
            onDispatch={dispatch}
          />
        ),
      },
      {
        id: 'problems',
        label: 'Problems',
        icon: AlertTriangle,
        badge: state.problems.length || undefined,
        render: () => <ProblemsView problems={state.problems} />,
      },
    ]
  }, [state, dispatch])

  if (!state) {
    return (
      <DialogProvider>
        <ContextMenuProvider>
          <div className="h-screen flex items-center justify-center text-stone-500 dark:text-neutral-500 text-sm">
            Connecting to main window…
          </div>
        </ContextMenuProvider>
      </DialogProvider>
    )
  }

  return (
    <DialogProvider>
      <ContextMenuProvider>
        <div
          className="h-screen flex flex-col bg-stone-50 dark:bg-neutral-950"
          style={{ fontSize: state.ui.fontSize }}
        >
          <BottomPanel
            tabs={tabs}
            activeTab={state.activeTab}
            onSelectTab={(tab) => dispatch({ type: 'select-tab', tabId: tab })}
            headerRight={
              <DockPlacementMenu
                placement="popout"
                canPopOut={false}
                onChange={(next) => {
                  if (next === 'bottom' || next === 'right') {
                    dispatch({ type: 'set-placement', placement: next })
                  }
                }}
              />
            }
          />
        </div>
      </ContextMenuProvider>
    </DialogProvider>
  )
}

function RunsView({
  runs,
  activeRunId,
  streamingRunId,
  onDispatch,
}: {
  runs: DockState['runs']
  activeRunId: string | null
  streamingRunId: string | null
  onDispatch: (action: UserAction) => void
}) {
  // The "active" run is activeRunId if it exists in runs; else the first run.
  const active = useMemo(() => {
    if (runs.length === 0) return null
    if (activeRunId) return runs.find((r) => r.id === activeRunId) ?? runs[0]
    return runs[0]
  }, [runs, activeRunId])

  if (!active) {
    return (
      <div className="h-full flex items-center justify-center text-stone-500 dark:text-neutral-500 text-sm">
        No runs yet.
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Run-tab strip */}
      <div className="shrink-0 flex items-center gap-1 overflow-x-auto border-b border-stone-200 dark:border-neutral-800 px-2 py-1">
        {runs.map((r) => {
          const isActive = r.id === active.id
          const isStreaming = streamingRunId === r.id
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onDispatch({ type: 'select-run', runId: r.id })}
              className={`group flex items-center gap-1.5 px-2 py-0.5 rounded text-xs whitespace-nowrap ${
                isActive
                  ? 'bg-stone-200 dark:bg-neutral-800 text-stone-900 dark:text-neutral-100'
                  : 'hover:bg-stone-100 dark:hover:bg-neutral-800/50 text-stone-600 dark:text-neutral-400'
              }`}
            >
              <span className="font-medium">{r.agentLabel}</span>
              {isStreaming && <span className="text-stone-400">…</span>}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  onDispatch({ type: 'delete-run', runId: r.id })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    onDispatch({ type: 'delete-run', runId: r.id })
                  }
                }}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 ml-1 px-0.5 leading-none"
                aria-label="Close run"
              >
                ×
              </span>
            </button>
          )
        })}
      </div>

      {/* Active run content */}
      <RunDetail run={active} streamingRunId={streamingRunId} onDispatch={onDispatch} />
    </div>
  )
}

function RunDetail({
  run,
  streamingRunId,
  onDispatch,
}: {
  run: DockState['runs'][number]
  streamingRunId: string | null
  onDispatch: (action: UserAction) => void
}) {
  const [refineText, setRefineText] = useState('')
  const [sourceOpen, setSourceOpen] = useState(false)

  const ctxMenu = useContextMenu()
  const refineRef = useRef<HTMLTextAreaElement>(null)
  const responseRef = useRef<HTMLDivElement>(null)

  const busy = run.status === 'streaming' || run.status === 'refining' || streamingRunId === run.id
  const canRefine = !!run.basePrompt
  const refineCount = run.followups?.length ?? 0

  const submitRefine = () => {
    const text = refineText.trim()
    if (!text || busy) return
    onDispatch({ type: 'refine-run', runId: run.id, message: text })
    setRefineText('')
  }

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

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="shrink-0 px-3 py-2 border-b border-stone-200 dark:border-neutral-800 flex items-center justify-between">
        <div className="text-xs text-stone-500 dark:text-neutral-400 flex items-center gap-2">
          <StatusPill status={run.status} />
          <span>{run.provider} · {run.model}</span>
          {refineCount > 0 && (
            <span className="text-stone-400">· refined {refineCount}×</span>
          )}
          {run.tokenUsage && (
            <span className="text-stone-400">
              · {run.tokenUsage.input ?? '?'}+{run.tokenUsage.output ?? '?'} tok
            </span>
          )}
          {run.elapsedMs != null && (
            <span className="text-stone-400">· {(run.elapsedMs / 1000).toFixed(1)}s</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onDispatch({ type: 'rerun-agent', runId: run.id })}
            disabled={busy}
            className="text-xs px-2 py-0.5 rounded text-stone-500 hover:bg-stone-100 dark:hover:bg-neutral-800 disabled:opacity-50"
          >
            Re-run
          </button>
          <button
            type="button"
            onClick={() => onDispatch({ type: 'delete-run', runId: run.id })}
            className="text-xs px-2 py-0.5 rounded text-stone-500 hover:bg-stone-100 dark:hover:bg-neutral-800"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Source (collapsible) */}
      {run.sourceText && (
        <div className="shrink-0 border-b border-stone-200 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => setSourceOpen((v) => !v)}
            className="w-full px-3 py-1.5 text-left text-xs text-stone-500 dark:text-neutral-400 hover:bg-stone-50 dark:hover:bg-neutral-800/50"
          >
            {sourceOpen ? '▾' : '▸'} Source ({run.sourceText.length} chars)
          </button>
          {sourceOpen && (
            <div className="px-3 pb-2 text-xs text-stone-600 dark:text-neutral-400 whitespace-pre-wrap max-h-40 overflow-y-auto">
              {run.sourceText}
            </div>
          )}
        </div>
      )}

      {/* Status banners */}
      {run.status === 'error' && (
        <div className="shrink-0 mx-3 my-2 px-3 py-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded text-xs text-red-700 dark:text-red-300">
          {run.error || 'Something went wrong.'}
        </div>
      )}
      {run.status === 'aborted' && (
        <div className="shrink-0 mx-3 my-2 px-3 py-2 bg-stone-100 dark:bg-neutral-800/60 border border-stone-300 dark:border-neutral-700 rounded text-xs">
          Stopped. Partial output above is what was streamed before cancel.
        </div>
      )}
      {run.truncated && run.status !== 'error' && !busy && (
        <div className="shrink-0 mx-3 my-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded text-xs text-amber-800 dark:text-amber-200">
          <strong>Response was cut short.</strong> The model hit the output token
          limit before finishing. Raise <em>Max output tokens</em> in settings, or
          split the selection into smaller chunks. The result below is incomplete —
          review carefully before applying.
        </div>
      )}

      {/* Response — main-side parsed sections (Notes / Suggested rewrite / Diff) */}
      <div
        ref={responseRef}
        onContextMenu={onResponseContextMenu}
        className="flex-1 overflow-y-auto px-3 py-2 text-sm"
      >
        {run.parsedFeedback && (
          <Section
            title={
              run.outputMode === 'feedback-only' && run.agentId === 'summarise' ? 'Summary' : 'Notes'
            }
          >
            <div className="whitespace-pre-wrap leading-relaxed">{run.parsedFeedback}</div>
            {run.outputMode === 'feedback-only' && !busy && (
              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(run.parsedFeedback!)}
                  className="px-3 py-1 rounded border border-stone-300 dark:border-neutral-700 text-stone-700 dark:text-neutral-300 text-xs"
                >
                  Copy
                </button>
              </div>
            )}
          </Section>
        )}

        {run.parsedRewrite && run.outputMode !== 'feedback-only' && (
          <Section title={run.parsedFeedback ? 'Suggested rewrite' : 'Result'}>
            <div className={`whitespace-pre-wrap leading-relaxed font-serif ${busy ? 'streaming-cursor' : ''}`}>
              {run.parsedRewrite}
            </div>
            {run.sourceText && !busy && (
              <DiffView original={run.sourceText} updated={run.parsedRewrite} />
            )}
            {!busy && (
              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => onDispatch({ type: 'apply-run', runId: run.id })}
                  disabled={run.schemaVersion !== 2}
                  className="px-3 py-1 rounded bg-stone-700 dark:bg-neutral-700 text-white text-xs disabled:opacity-50"
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
                  onClick={() => navigator.clipboard.writeText(run.parsedRewrite!)}
                  className="px-3 py-1 rounded border border-stone-300 dark:border-neutral-700 text-stone-700 dark:text-neutral-300 text-xs"
                >
                  Copy
                </button>
              </div>
            )}
          </Section>
        )}

        {!run.parsedFeedback && !run.parsedRewrite && busy && (
          <Section title="Working…">
            <div className="streaming-cursor"> </div>
          </Section>
        )}

        {/* Fallback: parser found nothing — show raw so the user sees something */}
        {!run.parsedFeedback && !run.parsedRewrite && !busy && run.response && (
          <pre className="whitespace-pre-wrap break-words font-sans">{run.response}</pre>
        )}

        {/* Followups (refine rounds) — user/assistant pairs below the main response */}
        {run.followups && run.followups.length > 0 && (
          <Section title="Refinements">
            <div className="space-y-3">
              {run.followups.map((f, i) => (
                <div key={i} className="space-y-2">
                  <Bubble key={`u-${i}`} message={{ id: `fu-${i}`, role: 'user', content: f.user }} />
                  <Bubble key={`a-${i}`} message={{ id: `fa-${i}`, role: 'assistant', content: f.assistant }} />
                  {(f.tokenUsage || f.elapsedMs != null) && (
                    <div className="text-[10px] text-stone-400 dark:text-neutral-500 pl-1">
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

      {/* Refine input */}
      {canRefine && run.status !== 'error' && (
        <div className="shrink-0 border-t border-stone-200 dark:border-neutral-800 px-3 py-2 bg-stone-50 dark:bg-neutral-900/60">
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
              placeholder={busy ? 'Working…' : 'Discuss or refine this edit'}
              disabled={busy}
              minRows={2}
              maxRows={6}
              className="flex-1 resize-none rounded border border-stone-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm px-2 py-1.5 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-stone-400"
            />
            <button
              type="button"
              onClick={submitRefine}
              disabled={!refineText.trim() || busy}
              className="self-end px-3 py-1 rounded bg-stone-700 dark:bg-neutral-700 text-white text-xs disabled:opacity-50"
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
    <section className="mt-2 first:mt-0">
      <h3 className="text-[10px] uppercase tracking-wider text-stone-500 dark:text-neutral-400 mb-1.5">
        {title}
      </h3>
      {children}
    </section>
  )
}

function DiffView({ original, updated }: { original: string; updated: string }) {
  const parts = useMemo(() => computeDiff(original, updated), [original, updated])
  return (
    <details className="mt-3">
      <summary className="text-xs text-stone-500 dark:text-neutral-400 cursor-pointer hover:text-stone-700 dark:hover:text-neutral-300">
        Show diff
      </summary>
      <div className="mt-2 p-3 bg-stone-50 dark:bg-neutral-800/40 rounded font-serif whitespace-pre-wrap leading-relaxed">
        {parts.map((p, i) => {
          if (p.added) {
            return (
              <span key={i} className="bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-200">
                {p.value}
              </span>
            )
          }
          if (p.removed) {
            return (
              <span key={i} className="bg-red-100 dark:bg-red-900/40 text-red-900 dark:text-red-200 line-through">
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

function ChatView({
  messages,
  provider,
  model,
  busy,
  onDispatch,
}: {
  messages: DockState['chatMessages']
  provider: string
  model: string
  busy: boolean
  onDispatch: (action: UserAction) => void
}) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dialogs = useDialogs()
  const ctxMenu = useContextMenu()

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const send = () => {
    const text = input.trim()
    if (!text || busy) return
    onDispatch({ type: 'send-chat', text })
    setInput('')
  }

  const clear = () => {
    void (async () => {
      const ok = await dialogs.confirm({
        title: 'Clear chat history?',
        message: 'This will remove all messages from the current chat.',
        confirmLabel: 'Clear',
        danger: true,
      })
      if (ok) onDispatch({ type: 'clear-chat' })
    })()
  }

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

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-3 py-1.5 border-b border-stone-200 dark:border-neutral-800 flex items-center justify-between">
        <div className="text-xs text-stone-500 dark:text-neutral-400">
          {provider} · {model} · the document is shared with this chat
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clear}
              disabled={busy}
              className="text-xs px-2 py-0.5 rounded text-stone-500 hover:bg-stone-100 dark:hover:bg-neutral-800 disabled:opacity-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-sm">
        {messages.length === 0 && (
          <div className="text-sm text-stone-500 dark:text-neutral-400 text-center py-8">
            Ask anything about the document.<br />
            Try: <em>"Summarise this in one sentence"</em> or <em>"What's missing from the argument?"</em>
          </div>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
      </div>
      <div className="border-t border-stone-200 dark:border-neutral-800 p-2">
        <div className="flex items-end gap-2">
          <AutoGrowTextarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            onContextMenu={onInputContextMenu}
            minRows={2}
            maxRows={6}
            placeholder="Message the document…"
            className="flex-1 resize-none rounded border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-sm px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-stone-400"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => onDispatch({ type: 'stop-chat' })}
              className="self-end px-3 py-1 rounded bg-stone-300 dark:bg-neutral-700 text-stone-900 dark:text-white text-sm"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={send}
              disabled={!input.trim()}
              className="self-end px-3 py-1 rounded bg-stone-700 dark:bg-neutral-700 text-white disabled:opacity-50 text-sm"
            >
              Send
            </button>
          )}
        </div>
        <p className="text-xs text-stone-400 mt-1">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  )
}

function ProblemsView({ problems }: { problems: DockState['problems'] }) {
  if (problems.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-stone-500 dark:text-neutral-500 text-sm">
        No problems.
      </div>
    )
  }
  return (
    <ul className="h-full overflow-y-auto text-xs px-2 py-2">
      {problems.map((p, i) => (
        <li key={i} className="py-0.5">
          <span className="text-stone-500 mr-2">{p.rel}</span>
          {p.message}
        </li>
      ))}
    </ul>
  )
}
