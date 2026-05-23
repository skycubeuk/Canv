import { useState } from 'react'
import type { RecentRemote } from '../../lib/fs'

export interface OpenRemoteDialogProps {
  open: boolean
  recent: RecentRemote[]
  onConnect: (raw: string) => Promise<void>
  onClose: () => void
}

export default function OpenRemoteDialog({ open, recent, onConnect, onClose }: OpenRemoteDialogProps) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!open) return null

  async function submit() {
    if (!value.trim() || busy) return
    setError(null)
    setBusy(true)
    try {
      await onConnect(value)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div role="dialog" aria-label="Open Remote Workspace" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-elev rounded-lg shadow-xl w-[480px] p-6">
        <h2 className="text-lg font-semibold mb-3">Open Remote Workspace</h2>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="user@host:/path/to/workspace"
          className="w-full border border-default rounded-sm px-3 py-2 mb-3 bg-elev"
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        />
        {error && <div className="text-sm text-danger-fg mb-3">{error}</div>}
        {recent.length > 0 && (
          <div className="mb-3">
            <div className="text-xs uppercase tracking-wide text-muted mb-1">Recent</div>
            <ul className="space-y-1">
              {recent.map((r) => (
                <li key={r.raw}>
                  <button
                    type="button"
                    className="text-left w-full px-2 py-1 hover:bg-hover rounded-sm"
                    onClick={() => setValue(r.raw)}
                  >
                    {r.raw}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 rounded-sm border"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !value.trim()}
            className="px-3 py-1.5 rounded-sm bg-accent text-accent-fg disabled:opacity-50"
          >
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  )
}
