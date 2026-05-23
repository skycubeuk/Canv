import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { FileText, ChevronRight, ChevronDown } from 'lucide-react'
import type { CanvHistory, SnapshotEntry, CurrentChange, SnapshotDeltaEntry } from '../../../lib/history'
import { REASON_LABEL, smartTime, fullTime, formatSnapshotLabel } from '../../../lib/historyLabels'
import { SidebarSectionTitle, SidebarRow, SidebarMeta } from './SidebarChrome'

export type OpenDiffRequest =
  | { kind: 'current'; relPath: string; baseSha: string; baseLabel: string }
  | { kind: 'snapshot'; relPath: string; snapshotId: string; commitSha: string; baseLabel: string }
  | { kind: 'fileHistory'; relPath: string; snapshotId: string; commitSha: string; baseLabel: string }

export interface RestoreRequest { snapshotId: string; relPath: string }

export interface HistoryTabHandle {
  openCheckpointComposer: () => void
}

interface Props {
  history: CanvHistory
  onOpenDiff: (r: OpenDiffRequest) => void
  onCreateCheckpoint: (summary: string) => Promise<void> | void
  onRestore: (r: RestoreRequest) => void
}

const STATUS_BADGE: Record<CurrentChange['status'], string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
}

function basename(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i >= 0 ? rel.slice(i + 1) : rel
}

export const HistoryTab = forwardRef<HistoryTabHandle, Props>(function HistoryTab(
  { history, onOpenDiff, onCreateCheckpoint, onRestore }, ref,
) {
  const [changes, setChanges] = useState<CurrentChange[]>([])
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>([])
  const [tipCommit, setTipCommit] = useState<string | null>(null)
  const [includeHidden, setIncludeHidden] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerText, setComposerText] = useState('Manual checkpoint')
  const [deltaCache, setDeltaCache] = useState<Record<string, SnapshotDeltaEntry[] | 'loading'>>({})
  const deltaCacheRef = useRef<Record<string, SnapshotDeltaEntry[] | 'loading'>>({})

  const refresh = useCallback(async () => {
    const [c, s, tip] = await Promise.all([
      history.getCurrentChanges(),
      history.listSnapshots({ includeHidden }),
      history.getTipCommit(),
    ])
    setChanges(c)
    setSnapshots(s)
    setTipCommit(tip)
    deltaCacheRef.current = {}
    setDeltaCache({})
  }, [history, includeHidden])

  const ensureDelta = useCallback(async (id: string) => {
    if (deltaCacheRef.current[id] !== undefined) return
    deltaCacheRef.current = { ...deltaCacheRef.current, [id]: 'loading' }
    setDeltaCache((prev) => ({ ...prev, [id]: 'loading' }))
    const out = await history.getSnapshotDelta(id)
    deltaCacheRef.current = { ...deltaCacheRef.current, [id]: out }
    setDeltaCache((prev) => ({ ...prev, [id]: out }))
  }, [history])

  useEffect(() => { void refresh() }, [refresh])

  const latestSnapshot = snapshots[0] ?? null
  const currentBaseLabel = latestSnapshot ? formatSnapshotLabel(latestSnapshot) : 'Last snapshot'

  const submitCheckpoint = async () => {
    await onCreateCheckpoint(composerText || 'Manual checkpoint')
    setComposerOpen(false)
    setComposerText('Manual checkpoint')
    await refresh()
  }

  useImperativeHandle(ref, () => ({
    openCheckpointComposer: () => setComposerOpen(true),
  }), [])

  return (
    <aside className="h-full flex flex-col bg-panel">
      {composerOpen && (
        <div className="px-3 pt-1 pb-2 flex items-center gap-1.5">
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
            className="btn-primary btn-sm"
          >
            Save
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Current changes section */}
        <section>
          <SidebarSectionTitle>Current changes</SidebarSectionTitle>
          {changes.length === 0 ? (
            <div className="px-3 pb-2 text-xs text-subtle">No changes since last checkpoint.</div>
          ) : (
            <ul>
              {changes.map((c) => (
                <li key={c.relPath}>
                  <SidebarRow
                    onClick={() => {
                      if (!tipCommit) return
                      onOpenDiff({
                        kind: 'current',
                        relPath: c.relPath,
                        baseSha: tipCommit,
                        baseLabel: currentBaseLabel,
                      })
                    }}
                    title={c.relPath}
                  >
                    <FileText aria-hidden className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate flex-1 text-left">{basename(c.relPath)}</span>
                    <span className="text-[10px] font-mono text-subtle tabular-nums shrink-0" aria-label={c.status}>
                      {STATUS_BADGE[c.status]}
                    </span>
                  </SidebarRow>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Timeline section */}
        <section className="border-t border-default mt-2 pt-2">
          <SidebarSectionTitle>Timeline</SidebarSectionTitle>

          {snapshots.length === 0 ? (
            <div className="px-3 pb-2 text-xs text-subtle">No snapshots yet.</div>
          ) : (
            <ul>
              {snapshots.map((s) => {
                const isOpen = expanded === s.id
                return (
                  <li key={s.id} className={s.hidden ? 'opacity-50' : ''}>
                    <SidebarRow
                      onClick={() => {
                        setExpanded((cur) => {
                          const next = cur === s.id ? null : s.id
                          return next
                        })
                        if (expanded !== s.id) void ensureDelta(s.id)
                      }}
                    >
                      {isOpen
                        ? <ChevronDown aria-hidden className="w-2.5 h-2.5 shrink-0 text-subtle" />
                        : <ChevronRight aria-hidden className="w-2.5 h-2.5 shrink-0 text-subtle" />}
                      <SidebarMeta title={fullTime(s.createdAt)}>
                        {smartTime(s.createdAt)}
                      </SidebarMeta>
                      <span className="text-[10px] uppercase tracking-wider text-subtle px-1 py-0 rounded-sm bg-elev shrink-0">
                        {REASON_LABEL[s.reason]}
                      </span>
                      <span className="truncate flex-1 text-left">{s.summary}</span>
                    </SidebarRow>

                    {isOpen && (
                      <div className="pb-1.5">
                        {(() => {
                          const cache = deltaCache[s.id]
                          if (cache === undefined || cache === 'loading') {
                            return <div className="pl-7 pr-3 py-1 text-xs text-subtle">Computing changes…</div>
                          }
                          if (cache.length === 0) {
                            return <div className="pl-7 pr-3 py-1 text-xs text-subtle">No differences between this snapshot and current files.</div>
                          }
                          return (
                            <ul>
                              {cache.map((d) => (
                                <li
                                  key={d.relPath}
                                  className="group flex items-center gap-1.5 pl-7 pr-2 py-[3px] text-[12.5px] text-muted hover:bg-hover"
                                >
                                  <FileText aria-hidden className="w-3 h-3 shrink-0 text-subtle" />
                                  <span className="truncate flex-1" title={d.relPath}>{basename(d.relPath)}</span>
                                  <span
                                    className="text-[10px] font-mono text-subtle shrink-0"
                                    aria-label={d.status}
                                  >
                                    {STATUS_BADGE[d.status]}
                                  </span>
                                  {d.status !== 'added' && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => onOpenDiff({
                                          kind: 'snapshot',
                                          relPath: d.relPath,
                                          snapshotId: s.id,
                                          commitSha: s.commit,
                                          baseLabel: formatSnapshotLabel(s),
                                        })}
                                        className="text-[10.5px] text-subtle hover:text-default opacity-0 group-hover:opacity-100"
                                        title="View diff"
                                      >
                                        diff
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => onRestore({ snapshotId: s.id, relPath: d.relPath })}
                                        className="text-[10.5px] text-subtle hover:text-default opacity-0 group-hover:opacity-100"
                                        title="Restore from this snapshot"
                                      >
                                        restore
                                      </button>
                                    </>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )
                        })()}
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

      <div className="shrink-0 px-3 py-2 border-t border-default">
        <label className="inline-flex items-center gap-1.5 text-xs text-subtle cursor-pointer">
          <input
            type="checkbox"
            checked={includeHidden}
            onChange={(e) => setIncludeHidden(e.target.checked)}
            className="accent-[rgb(var(--accent))]"
          />
          Show hidden
        </label>
      </div>
    </aside>
  )
})
