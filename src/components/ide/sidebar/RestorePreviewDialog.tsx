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
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-zinc-900 rounded-lg p-4 w-[640px] max-h-[80vh] flex flex-col shadow-xl">
        <h2 className="text-base font-semibold mb-2">Restore {relPath}</h2>
        {!preview && <p className="text-sm">Loading preview…</p>}
        {preview && (
          <div className="grid grid-cols-2 gap-2 flex-1 overflow-auto text-xs font-mono">
            <pre className="bg-zinc-50 dark:bg-zinc-800 p-2 whitespace-pre-wrap">{preview.snapshotText}</pre>
            <pre className="bg-zinc-50 dark:bg-zinc-800 p-2 whitespace-pre-wrap">{preview.currentText}</pre>
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button className="px-3 py-1.5 text-sm rounded border" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white"
            disabled={busy || !preview}
            onClick={confirm}
          >
            {busy ? 'Restoring…' : 'Restore'}
          </button>
        </div>
      </div>
    </div>
  )
}
