import { useState, useMemo, useRef, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, RotateCw } from 'lucide-react'
import { computeDiff } from '../lib/diff'
import { parseAgentResponse } from '../agents/runner'
import { parseReviewNotes } from '../lib/suggestions/reviewNotes'
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
import type { Message, TokenUsage } from '../adapters/types'
import { providerName } from '../adapters'

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
  /** Set true once the rewrite has been written into the editor. Disables
   *  Apply so a second click can't prepend another copy of the change. */
  applied?: boolean
  /** True when this run's rewrite was rendered as an inline diff in the
   *  document; the Runs panel then shows a hint instead of an Apply button. */
  inlineEmitted?: boolean
  /** Set false to suppress the diff preview in the Runs panel (inline display
   *  mode). Absent on legacy runs → treated as true so older runs still show
   *  their diff. */
  showDiffInPanel?: boolean
  /** True when this run's review notes were rendered as inline annotations in
   *  the document. Undefined on legacy runs → treated as true so the existing
   *  "Marked in the document" caption still shows. False in 'panel' display
   *  mode, where notes appear only as the panel list. */
  annotationsInlined?: boolean
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

  // Some agents (e.g. Test Reader) emit a JSON array of {quote, comment} that
  // becomes inline annotations in the document. Showing that raw JSON in the
  // panel confuses non-technical users, so render it as a readable list and,
  // while the JSON is still streaming, show a friendly progress state instead.
  const reviewNotes = useMemo(() => parseReviewNotes(run.response), [run.response])
  const looksStructured = useMemo(() => {
    // Replacement agents produce prose rewrites, never review-note JSON.
    if (agent?.outputMode === 'replacement') return false
    if (reviewNotes) return true
    const t = run.response.trimStart()
    return t.startsWith('[') || t.startsWith('```')
  }, [agent?.outputMode, reviewNotes, run.response])

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
        <div className="px-4 py-3 m-3 bg-danger-soft border border-danger rounded-sm text-sm text-danger-fg">
          {run.error || 'Something went wrong.'}
        </div>
      )}

      {run.status === 'aborted' && (
        <div className="px-4 py-3 m-3 bg-elev border border-default rounded-sm text-sm text-muted">
          Stopped. The partial output above is what was streamed before you cancelled.
        </div>
      )}

      {run.truncated && run.status !== 'error' && !busy && (
        <div className="px-4 py-3 m-3 bg-warning-soft border border-warning rounded-sm text-sm text-warning-fg">
          <strong>Response was cut short.</strong> The model hit the output token
          limit before finishing. Raise <em>Max output tokens</em> in settings, or
          split the selection into smaller chunks. The result below is incomplete —
          review carefully before applying.
        </div>
      )}

      {/* Structured review notes: a readable list (or a progress state while the
          JSON is still streaming) instead of the raw JSON array. */}
      {looksStructured ? (
        busy ? (
          <Section title="Reading…">
            <div className="text-sm text-subtle streaming-cursor">Reading your text and noting reactions…</div>
          </Section>
        ) : reviewNotes ? (
          <Section title={`Notes (${reviewNotes.length})`}>
            <div className="space-y-3">
              {reviewNotes.map((n, i) => (
                <div key={i} className="text-sm">
                  <div className="text-xs text-subtle italic mb-0.5">"{n.quote}"</div>
                  <div className="leading-relaxed">{n.comment}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-3">
              {(run.annotationsInlined ?? true) && (
                <span className="text-xs text-subtle italic flex-1">Marked in the document ↑</span>
              )}
              <button
                type="button"
                className="btn-secondary ml-auto"
                onClick={() =>
                  navigator.clipboard.writeText(reviewNotes.map((n) => `"${n.quote}"\n${n.comment}`).join('\n\n'))
                }
              >
                Copy
              </button>
            </div>
          </Section>
        ) : (
          // Done but the JSON didn't parse — fall back to the raw text so nothing is lost.
          <Section title="Notes">
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{parsed.feedback ?? run.response}</div>
          </Section>
        )
      ) : parsed.feedback ? (
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
      ) : null}

      {parsed.rewrite && agent?.outputMode !== 'feedback-only' && (
        <Section title={parsed.feedback ? 'Suggested rewrite' : 'Result'}>
          <div className={`text-sm whitespace-pre-wrap leading-relaxed font-serif ${busy ? 'streaming-cursor' : ''}`}>
            {parsed.rewrite}
          </div>

          {run.sourceText && parsed.rewrite && !busy && (run.showDiffInPanel ?? true) && (
            <DiffView original={run.sourceText} updated={parsed.rewrite} />
          )}

          {!busy && parsed.rewrite && (
            <div className="flex items-center gap-2 mt-3">
              {run.inlineEmitted ? (
                <span className="text-xs text-subtle italic">Review inline in the document ↑</span>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => onApply(run, parsed.rewrite!)}
                  disabled={run.schemaVersion !== 2 || run.applied === true}
                  title={
                    run.schemaVersion !== 2
                      ? 'Run was created with the previous editor — re-run to apply'
                      : run.applied
                        ? 'Already applied — re-run to produce a fresh edit'
                        : run.range
                          ? 'Replace selection with this text'
                          : 'Replace the entire document with this text'
                  }
                >
                  {run.applied ? 'Applied' : 'Apply'}
                </button>
              )}
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
          <div className="space-y-4">
            {run.followups.map((f, i) => (
              <div key={i} className="space-y-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted mb-1">You</div>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed bg-elev border border-default rounded-sm px-3 py-2">
                    {f.user}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted mb-1">Reply</div>
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">
                    {f.assistant}
                  </div>
                </div>
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
              className="flex-1 resize-none px-3 py-2 text-sm rounded-md border border-default bg-elev focus:outline-hidden focus:ring-2 focus:ring-accent disabled:opacity-50"
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
      <div className="mt-2 p-3 bg-panel rounded-sm text-sm font-serif whitespace-pre-wrap leading-relaxed">
        {parts.map((p, i) => {
          if (p.added) {
            return (
              <span key={i} className="bg-success-soft text-success-fg">
                {p.value}
              </span>
            )
          }
          if (p.removed) {
            return (
              <span key={i} className="bg-danger-soft text-danger-fg line-through">
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
  streaming: { label: 'Streaming', className: 'bg-info-soft text-info-fg' },
  refining:  { label: 'Refining',  className: 'bg-accent-soft text-accent' },
  done:      { label: 'Done',      className: 'bg-success-soft text-success-fg' },
  error:     { label: 'Error',     className: 'bg-danger-soft text-danger-fg' },
  aborted:   { label: 'Stopped',   className: 'bg-elev text-muted' },
}

export function StatusPill({ status }: { status: RunRecord['status'] }) {
  const { label, className } = STATUS_PILL[status]
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-sm uppercase tracking-wide ${className}`}>
      {label}
    </span>
  )
}
