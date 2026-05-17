import { useEffect, useState, useCallback } from 'react'
import type { SiteEntryWithStaleness } from '../../../lib/sites'

interface Props {
  onRegenerate: (prompt: string) => void
}

export function SitesTab({ onRegenerate }: Props) {
  const [entries, setEntries] = useState<SiteEntryWithStaleness[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!window.canvSites) { setEntries([]); return }
    try {
      const list = await window.canvSites.listWithStaleness()
      const sorted = [...list].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return Date.parse(b.updated) - Date.parse(a.updated)
      })
      setEntries(sorted)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setEntries([])
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh is async; setState runs after the fetch resolves, not synchronously in the effect body
    void refresh()
    if (!window.canvSites) return
    const off = window.canvSites.onRegistryChanged(() => { void refresh() })
    return off
  }, [refresh])

  if (error) {
    return <div className="p-4 text-sm text-red-500">Sites registry error: {error}</div>
  }
  if (entries === null) return <div className="p-4 text-sm text-muted">Loading…</div>
  if (entries.length === 0) {
    return (
      <div className="p-4 text-sm text-muted">
        <p>No sites yet.</p>
        <p className="mt-2">Ask the chat agent to build a view of your work — for example: <em>&quot;Show me a timeline of every scene with POV and location.&quot;</em></p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-2 p-2">
      {entries.map((e) => (
        <li key={e.id} className="rounded-sm border border-default bg-panel px-3 py-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium text-default">{e.name}</div>
            <button
              type="button"
              aria-label={e.pinned ? 'Unpin' : 'Pin'}
              onClick={() => { void window.canvSites?.setPinned(e.id, !e.pinned) }}
              className="text-xs text-muted hover:text-default"
            >
              {e.pinned ? '📌' : '📍'}
            </button>
          </div>
          {e.description && <div className="mt-0.5 text-xs text-muted">{e.description}</div>}
          {e.stale && <div className="mt-0.5 text-xs text-amber-500">⚠ stale</div>}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              aria-label="Open"
              onClick={() => { void window.canvSites?.open(e.id) }}
              className="rounded-sm border border-default px-2 py-0.5 text-xs text-default hover:bg-hover"
            >Open</button>
            <button
              type="button"
              aria-label="Regenerate"
              onClick={() => onRegenerate(e.prompt)}
              className="rounded-sm border border-default px-2 py-0.5 text-xs text-default hover:bg-hover"
            >Regenerate</button>
            <button
              type="button"
              aria-label="Delete"
              onClick={() => { void window.canvSites?.delete(e.id) }}
              className="rounded-sm border border-default px-2 py-0.5 text-xs text-default hover:bg-hover"
            >Delete</button>
          </div>
        </li>
      ))}
    </ul>
  )
}
