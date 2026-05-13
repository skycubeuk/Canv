import { useCallback, useEffect, useState } from 'react'
import type { CanvHistory, SnapshotEntry, CurrentChange } from '../../../lib/history'

export type OpenDiffRequest =
  | { kind: 'current'; relPath: string }
  | { kind: 'snapshot'; snapshotId: string; relPath: string }

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

export function HistoryTab({ history, onOpenDiff, onCreateCheckpoint, onRestore }: Props) {
  const [changes, setChanges] = useState<CurrentChange[]>([])
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>([])
  const [includeHidden, setIncludeHidden] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerText, setComposerText] = useState('Manual checkpoint')

  const refresh = useCallback(async () => {
    const [c, s] = await Promise.all([
      history.getCurrentChanges(),
      history.listSnapshots({ includeHidden }),
    ])
    setChanges(c)
    setSnapshots(s)
  }, [history, includeHidden])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh() is async; setState fires after await.
  useEffect(() => { void refresh() }, [refresh])

  const submitCheckpoint = async () => {
    await onCreateCheckpoint(composerText || 'Manual checkpoint')
    setComposerOpen(false)
    setComposerText('Manual checkpoint')
    await refresh()
  }

  return (
    <div className="flex flex-col h-full text-sm">
      <header className="flex items-center justify-between px-2 py-1 border-b">
        <span className="font-medium">History</span>
        <button
          className="text-xs px-2 py-0.5 rounded border"
          onClick={() => setComposerOpen((v) => !v)}
        >
          Create checkpoint
        </button>
      </header>
      {composerOpen && (
        <div className="px-2 py-2 border-b flex gap-1">
          <input
            className="flex-1 text-xs border rounded px-1"
            value={composerText}
            onChange={(e) => setComposerText(e.target.value)}
          />
          <button
            className="text-xs px-2 py-0.5 rounded bg-blue-600 text-white"
            onClick={submitCheckpoint}
          >
            Save
          </button>
        </div>
      )}

      <section className="px-2 py-1">
        <h3 className="text-xs uppercase text-zinc-500 mb-1">Current changes</h3>
        {changes.length === 0 && (
          <p className="text-xs text-zinc-500">No changes since last checkpoint.</p>
        )}
        <ul>
          {changes.map((c) => (
            <li key={c.relPath}>
              <button
                className="text-left w-full hover:underline"
                onClick={() => onOpenDiff({ kind: 'current', relPath: c.relPath })}
              >
                <span className="text-zinc-500 text-xs mr-1">[{c.status[0].toUpperCase()}]</span>
                {c.relPath}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="px-2 py-1 flex-1 overflow-auto border-t">
        <h3 className="text-xs uppercase text-zinc-500 mb-1">Timeline</h3>
        {snapshots.length === 0 && (
          <p className="text-xs text-zinc-500">No snapshots yet.</p>
        )}
        <ul>
          {snapshots.map((s) => (
            <li key={s.id} className={s.hidden ? 'opacity-40' : ''}>
              <button
                className="w-full text-left flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 px-1 py-0.5"
                onClick={() => setExpanded((cur) => cur === s.id ? null : s.id)}
              >
                <span className="text-[10px] uppercase text-zinc-500">{REASON_LABEL[s.reason]}</span>
                <span className="flex-1 truncate">{s.summary}</span>
                <span className="text-[10px] text-zinc-500">{s.files.length}f</span>
              </button>
              {expanded === s.id && (
                <div className="pl-4 py-1">
                  {s.files.length === 0 && (
                    <p className="text-xs text-zinc-500">No file hints recorded.</p>
                  )}
                  {s.files.map((f) => (
                    <div key={f} className="flex items-center gap-2">
                      <span className="flex-1 truncate">{f}</span>
                      <button
                        className="text-xs underline"
                        onClick={() => onOpenDiff({ kind: 'snapshot', snapshotId: s.id, relPath: f })}
                      >
                        diff
                      </button>
                      <button
                        className="text-xs underline"
                        onClick={() => onRestore({ snapshotId: s.id, relPath: f })}
                      >
                        restore
                      </button>
                    </div>
                  ))}
                  {!s.hidden && (
                    <button
                      className="text-xs underline text-zinc-500 mt-1"
                      onClick={async () => {
                        await history.hideSnapshot(s.id)
                        await refresh()
                      }}
                    >
                      Hide snapshot
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        <label className="text-xs text-zinc-500 mt-2 inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={includeHidden}
            onChange={(e) => setIncludeHidden(e.target.checked)}
          />
          Show hidden
        </label>
      </section>
    </div>
  )
}
