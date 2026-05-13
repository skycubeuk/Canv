import { useEffect, useState } from 'react'
import type { CanvHistory } from '../../../lib/history'

interface Props {
  history: CanvHistory
  snapshotId: string
  relPath: string
  onCancel: () => void
  onRestored: (rollbackId: string) => void
  saveDirtyBuffer: (relPath: string) => Promise<void>
}

export function RestorePreviewDialog({
  history, snapshotId, relPath, onCancel, onRestored, saveDirtyBuffer,
}: Props) {
  const [preview, setPreview] = useState<{ snapshotText: string; currentText: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    history.restoreFilePreview(snapshotId, relPath).then((p) => { if (!cancelled) setPreview(p) })
    return () => { cancelled = true }
  }, [history, snapshotId, relPath])

  const confirm = async () => {
    setBusy(true)
    try {
      await saveDirtyBuffer(relPath)
      const r = await history.restoreFile(snapshotId, relPath)
      onRestored(r.rollbackSnapshotId)
    } finally { setBusy(false) }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Restore ${relPath}`}
        className="w-full max-w-3xl max-h-[80vh] flex flex-col rounded-lg border border-default bg-elev shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 px-4 py-3 border-b border-default flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold tracking-wider uppercase text-subtle">
              Restore file
            </div>
            <div className="text-sm font-medium text-default truncate" title={relPath}>
              {relPath}
            </div>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-hidden p-4">
          {!preview && (
            <div className="h-full grid place-items-center text-sm text-muted">
              Loading preview…
            </div>
          )}
          {preview && (
            <div className="h-full grid grid-cols-2 gap-3">
              <div className="flex flex-col min-h-0">
                <div className="text-[10.5px] font-semibold tracking-wider uppercase text-subtle mb-1.5">
                  Snapshot
                </div>
                <pre className="flex-1 min-h-0 overflow-auto rounded-sm border border-default bg-app p-2 text-xs font-mono text-default whitespace-pre-wrap break-words">
                  {preview.snapshotText}
                </pre>
              </div>
              <div className="flex flex-col min-h-0">
                <div className="text-[10.5px] font-semibold tracking-wider uppercase text-subtle mb-1.5">
                  Current
                </div>
                <pre className="flex-1 min-h-0 overflow-auto rounded-sm border border-default bg-app p-2 text-xs font-mono text-default whitespace-pre-wrap break-words">
                  {preview.currentText}
                </pre>
              </div>
            </div>
          )}
        </div>

        <footer className="shrink-0 px-4 py-3 border-t border-default flex items-center justify-between gap-3">
          <p className="text-xs text-subtle">
            A safety snapshot is taken before restore — you can roll forward from the timeline.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="px-3 py-1 text-xs rounded-sm border border-default text-default hover:bg-hover disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={busy || !preview}
              className="btn-primary py-1! px-3! text-xs disabled:opacity-50"
            >
              {busy ? 'Restoring…' : 'Restore'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
