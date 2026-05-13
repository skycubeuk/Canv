import { useCallback, useEffect, useState } from 'react'
import { Plus, FileText, ChevronRight, ChevronDown } from 'lucide-react'
import type { CanvHistory, SnapshotEntry, CurrentChange } from '../../../lib/history'

export type OpenDiffRequest =
  | { kind: 'current'; relPath: string; baseSha: string }
  | { kind: 'snapshot'; relPath: string; snapshotId: string; commitSha: string }

export interface RestoreRequest { snapshotId: string; relPath: string }

interface Props {
  history: CanvHistory
  onOpenDiff: (r: OpenDiffRequest) => void
  onCreateCheckpoint: (summary: string) => Promise<void> | void
  onRestore: (r: RestoreRequest) => void
}

const REASON_LABEL: Record<SnapshotEntry['reason'], string> = {
  manual: 'Manual',
  workspace_init: 'Init',
  before_ai_edit: 'AI: before',
  after_ai_edit: 'AI: after',
  before_rollback: 'Rollback',
  idle_autosave: 'Idle',
}

const STATUS_BADGE: Record<CurrentChange['status'], string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
}

const ALL_REASONS: SnapshotEntry['reason'][] = [
  'manual', 'workspace_init', 'before_ai_edit', 'after_ai_edit', 'before_rollback', 'idle_autosave',
]

function basename(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i >= 0 ? rel.slice(i + 1) : rel
}

function shortTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function HistoryTab({ history, onOpenDiff, onCreateCheckpoint, onRestore }: Props) {
  const [changes, setChanges] = useState<CurrentChange[]>([])
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>([])
  const [tipCommit, setTipCommit] = useState<string | null>(null)
  const [includeHidden, setIncludeHidden] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerText, setComposerText] = useState('Manual checkpoint')
  const [selectedReasons, setSelectedReasons] = useState<Set<SnapshotEntry['reason']>>(
    () => new Set(ALL_REASONS),
  )

  const refresh = useCallback(async () => {
    const [c, s, tip] = await Promise.all([
      history.getCurrentChanges(),
      history.listSnapshots({ includeHidden }),
      history.getTipCommit(),
    ])
    setChanges(c)
    setSnapshots(s)
    setTipCommit(tip)
  }, [history, includeHidden])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh() is async; setState fires after await.
  useEffect(() => { void refresh() }, [refresh])

  const submitCheckpoint = async () => {
    await onCreateCheckpoint(composerText || 'Manual checkpoint')
    setComposerOpen(false)
    setComposerText('Manual checkpoint')
    await refresh()
  }

  const visibleSnapshots = snapshots.filter((s) => selectedReasons.has(s.reason))

  return (
    <aside className="h-full flex flex-col bg-panel overflow-hidden">
      {/* Workspace header — mirrors the Files tab affordances */}
      <header className="shrink-0 flex items-center justify-between px-3 pt-2.5 pb-2">
        <span className="text-[10.5px] font-semibold tracking-wider uppercase text-subtle">
          History
        </span>
        <button
          type="button"
          aria-label="Create checkpoint"
          title="Create checkpoint"
          className="w-[22px] h-[22px] grid place-items-center rounded-sm text-subtle hover:bg-hover hover:text-default"
          onClick={() => setComposerOpen((v) => !v)}
        >
          <Plus aria-hidden className="w-3 h-3" />
        </button>
      </header>

      {composerOpen && (
        <div className="px-3 pb-2 flex gap-1.5">
          <input
            autoFocus
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitCheckpoint()
              if (e.key === 'Escape') setComposerOpen(false)
            }}
            placeholder="Checkpoint summary"
            className="flex-1 px-2 py-1 text-[12.5px] rounded-sm border border-default bg-elev text-default focus:outline-hidden focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            onClick={submitCheckpoint}
            className="btn-primary py-1! px-2! text-xs"
          >
            Save
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Current changes section */}
        <section>
          <div className="px-3 pt-1 pb-1 text-[10.5px] font-semibold tracking-wider uppercase text-subtle">
            Current changes
          </div>
          {changes.length === 0 ? (
            <div className="px-3 pb-2 text-xs text-subtle">No changes since last checkpoint.</div>
          ) : (
            <ul>
              {changes.map((c) => (
                <li key={c.relPath}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!tipCommit) return
                      onOpenDiff({ kind: 'current', relPath: c.relPath, baseSha: tipCommit })
                    }}
                    title={c.relPath}
                    className="group w-full flex items-center gap-1.5 pr-2 pl-3 py-[3px] text-[12.5px] rounded-sm text-muted hover:bg-hover hover:text-default transition-colors"
                  >
                    <FileText aria-hidden className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate flex-1 text-left">{basename(c.relPath)}</span>
                    <span className="text-[10px] font-mono text-subtle shrink-0" aria-label={c.status}>
                      {STATUS_BADGE[c.status]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Timeline section */}
        <section className="border-t border-default mt-2 pt-2">
          <div className="px-3 pb-1 text-[10.5px] font-semibold tracking-wider uppercase text-subtle">
            Timeline
          </div>

          {/* Reason filter chips */}
          <div className="px-3 pb-1.5 flex flex-wrap gap-1">
            {ALL_REASONS.map((r) => {
              const on = selectedReasons.has(r)
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSelectedReasons((prev) => {
                    const next = new Set(prev)
                    if (next.has(r)) next.delete(r)
                    else next.add(r)
                    return next
                  })}
                  aria-label={on ? `Hide ${REASON_LABEL[r]}` : `Show ${REASON_LABEL[r]}`}
                  className={`text-[9.5px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border ${
                    on
                      ? 'border-default bg-elev text-default'
                      : 'border-default text-subtle bg-transparent opacity-50 hover:opacity-100'
                  }`}
                  title={on ? `Hide ${REASON_LABEL[r]}` : `Show ${REASON_LABEL[r]}`}
                >
                  {REASON_LABEL[r]}
                </button>
              )
            })}
          </div>

          {visibleSnapshots.length === 0 ? (
            <div className="px-3 pb-2 text-xs text-subtle">
              {snapshots.length > 0 ? 'No snapshots match the current filter.' : 'No snapshots yet.'}
            </div>
          ) : (
            <ul>
              {visibleSnapshots.map((s) => {
                const isOpen = expanded === s.id
                return (
                  <li key={s.id} className={s.hidden ? 'opacity-50' : ''}>
                    <button
                      type="button"
                      onClick={() => setExpanded((cur) => cur === s.id ? null : s.id)}
                      className="w-full flex items-center gap-1.5 pr-2 pl-2 py-[3px] text-[12.5px] rounded-sm text-muted hover:bg-hover hover:text-default transition-colors"
                    >
                      {isOpen
                        ? <ChevronDown aria-hidden className="w-2.5 h-2.5 shrink-0 text-subtle" />
                        : <ChevronRight aria-hidden className="w-2.5 h-2.5 shrink-0 text-subtle" />}
                      <span className="text-[10px] font-mono text-subtle tabular-nums">
                        {shortTime(s.createdAt)}
                      </span>
                      <span className="text-[9.5px] uppercase tracking-wider text-subtle px-1 py-0 rounded-sm bg-elev shrink-0">
                        {REASON_LABEL[s.reason]}
                      </span>
                      <span className="truncate flex-1 text-left">{s.summary}</span>
                      {s.files.length > 0 && (
                        <span className="text-[10px] text-subtle tabular-nums shrink-0">
                          {s.files.length}
                        </span>
                      )}
                    </button>

                    {isOpen && (
                      <div className="pb-1.5">
                        {s.files.length === 0 ? (
                          <div className="pl-7 pr-3 py-1 text-xs text-subtle">No file hints recorded.</div>
                        ) : (
                          <ul>
                            {s.files.map((f) => (
                              <li
                                key={f}
                                className="group flex items-center gap-1.5 pl-7 pr-2 py-[3px] text-[12.5px] text-muted hover:bg-hover"
                              >
                                <FileText aria-hidden className="w-3 h-3 shrink-0 text-subtle" />
                                <span className="truncate flex-1" title={f}>{basename(f)}</span>
                                <button
                                  type="button"
                                  onClick={() => onOpenDiff({ kind: 'snapshot', relPath: f, snapshotId: s.id, commitSha: s.commit })}
                                  className="text-[10.5px] text-subtle hover:text-default opacity-0 group-hover:opacity-100"
                                  title="View diff"
                                >
                                  diff
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onRestore({ snapshotId: s.id, relPath: f })}
                                  className="text-[10.5px] text-subtle hover:text-default opacity-0 group-hover:opacity-100"
                                  title="Restore from this snapshot"
                                >
                                  restore
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        {!s.hidden && (
                          <button
                            type="button"
                            onClick={async () => { await history.hideSnapshot(s.id); await refresh() }}
                            className="ml-7 mt-1 text-[10.5px] text-subtle hover:text-default underline-offset-2 hover:underline"
                          >
                            Hide snapshot
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <footer className="shrink-0 px-3 py-2 border-t border-default">
        <label className="inline-flex items-center gap-1.5 text-xs text-subtle cursor-pointer">
          <input
            type="checkbox"
            checked={includeHidden}
            onChange={(e) => setIncludeHidden(e.target.checked)}
            className="accent-[rgb(var(--accent))]"
          />
          Show hidden
        </label>
      </footer>
    </aside>
  )
}
