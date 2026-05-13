import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import type { CanvHistory, FileHistoryEntry } from '../../../lib/history'
import { REASON_LABEL, shortTime, formatSnapshotLabel } from '../../../lib/historyLabels'

export interface FileHistoryOpenDiff {
  kind: 'fileHistory'
  relPath: string
  snapshotId: string
  commitSha: string
  baseLabel: string
}

export interface FileHistoryRestore { snapshotId: string; relPath: string }

interface Props {
  /** Path being viewed; null when nothing has been requested yet. */
  target: string | null
  /** Increments each time a fresh "View history" request is fired. */
  nonce: number
  history: CanvHistory
  onOpenDiff: (r: FileHistoryOpenDiff) => void
  onRestore: (r: FileHistoryRestore) => void
}


export function FileHistoryTab({ target, nonce, history, onOpenDiff, onRestore }: Props) {
  const [entries, setEntries] = useState<FileHistoryEntry[] | 'loading' | null>(null)

  useEffect(() => {
    if (!target) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional loading kickoff
    setEntries('loading')
    let cancelled = false
    history.getFileHistory(target).then((out) => {
      if (!cancelled) setEntries(out)
    })
    return () => { cancelled = true }
  }, [target, nonce, history])

  if (!target) {
    return (
      <div className="h-full p-3 text-xs text-subtle">
        Right-click a file in the Files tab and choose &quot;View history&quot; to see its revisions.
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-panel overflow-hidden">
      <header className="shrink-0 px-3 pt-2.5 pb-2 border-b border-default">
        <div className="text-[12.5px] text-default truncate" title={target}>
          <span className="font-semibold">History:</span>{' '}
          <span className="font-mono">{target}</span>
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {entries === 'loading' && (
          <div className="px-3 py-2 text-xs text-subtle">Loading versions…</div>
        )}
        {entries !== null && entries !== 'loading' && entries.length === 0 && (
          <div className="px-3 py-2 text-xs text-subtle">No history for this file yet.</div>
        )}
        {entries !== null && entries !== 'loading' && entries.length > 0 && (
          <ul>
            {entries.map((e) => (
              <li
                key={e.snapshotId}
                className="group flex items-center gap-1.5 px-3 py-[5px] text-[12.5px] text-muted hover:bg-hover hover:text-default"
              >
                <FileText aria-hidden className="w-3 h-3 shrink-0 text-subtle" />
                <span className="text-[10px] font-mono text-subtle tabular-nums shrink-0">
                  {shortTime(e.createdAt)}
                </span>
                <span className="text-[9.5px] uppercase tracking-wider text-subtle px-1 py-0 rounded-sm bg-elev shrink-0">
                  {REASON_LABEL[e.reason]}
                </span>
                <span className="text-[10px] font-mono text-subtle shrink-0" aria-label="modified">M</span>
                <button
                  type="button"
                  onClick={() => onOpenDiff({
                    kind: 'fileHistory',
                    relPath: target,
                    snapshotId: e.snapshotId,
                    commitSha: e.commit,
                    baseLabel: formatSnapshotLabel({
                      id: e.snapshotId, commit: e.commit, createdAt: e.createdAt,
                      reason: e.reason, summary: e.summary, files: [], hidden: false, metadata: {},
                    }),
                  })}
                  className="truncate flex-1 text-left"
                  title="View diff vs current file"
                >
                  {e.summary}
                </button>
                <button
                  type="button"
                  onClick={() => onRestore({ snapshotId: e.snapshotId, relPath: target })}
                  className="text-[10.5px] text-subtle hover:text-default opacity-0 group-hover:opacity-100"
                  title="Restore from this version"
                >
                  restore
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
