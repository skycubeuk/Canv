import { useEffect, useState, useCallback, useRef } from 'react'
import { Circle, CircleDot, AlertTriangle, MoreVertical } from 'lucide-react'
import type { SiteEntryWithStaleness } from '../../../lib/sites'
import { SidebarRowIcon, SidebarEmpty, SidebarIconButton, SidebarRowFrame } from './SidebarChrome'

interface Props {
  onRegenerate: (prompt: string) => void
}

export function SitesTab({ onRegenerate }: Props) {
  const [entries, setEntries] = useState<SiteEntryWithStaleness[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

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
    return <SidebarEmpty>Sites registry error: {error}</SidebarEmpty>
  }
  if (entries === null) return <SidebarEmpty>Loading…</SidebarEmpty>
  if (entries.length === 0) {
    return (
      <div className="px-3 py-3 text-xs text-subtle space-y-2">
        <p>No sites yet.</p>
        <p>Ask the chat agent to build a view of your work — for example: <em>&quot;Show me a timeline of every scene with POV and location.&quot;</em></p>
      </div>
    )
  }

  return (
    <ul role="list" className="py-1 m-0 p-0 list-none">
      {entries.map((e) => (
        <SitesRow
          key={e.id}
          entry={e}
          onOpen={() => { void window.canvSites?.open(e.id) }}
          onTogglePin={() => { void window.canvSites?.setPinned(e.id, !e.pinned) }}
          onRegenerate={() => onRegenerate(e.prompt)}
          onDelete={() => { void window.canvSites?.delete(e.id) }}
          menuOpen={menuOpenId === e.id}
          onMenuOpenChange={(open) => setMenuOpenId(open ? e.id : null)}
        />
      ))}
    </ul>
  )
}

interface RowProps {
  entry: SiteEntryWithStaleness
  onOpen: () => void
  onTogglePin: () => void
  onRegenerate: () => void
  onDelete: () => void
  menuOpen: boolean
  onMenuOpenChange: (open: boolean) => void
}

function SitesRow({
  entry, onOpen, onTogglePin, onRegenerate, onDelete, menuOpen, onMenuOpenChange,
}: RowProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const onMenuOpenChangeRef = useRef(onMenuOpenChange)
  useEffect(() => { onMenuOpenChangeRef.current = onMenuOpenChange })
  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (triggerRef.current && e.target instanceof Node && triggerRef.current.contains(e.target)) return
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) {
        onMenuOpenChangeRef.current(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMenuOpenChangeRef.current(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  return (
    <SidebarRowFrame
      leading={
        <SidebarIconButton
          aria-label={entry.pinned ? 'Unpin' : 'Pin'}
          icon={entry.pinned ? CircleDot : Circle}
          onClick={onTogglePin}
        />
      }
      trailing={
        <SidebarIconButton
          ref={triggerRef}
          aria-label="More actions"
          icon={MoreVertical}
          onClick={() => onMenuOpenChange(!menuOpen)}
        />
      }
      menu={menuOpen ? (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-1 top-full z-30 bg-elev border border-default rounded-sm shadow-lg p-1 min-w-[140px]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { onMenuOpenChange(false); onOpen() }}
            className="block w-full text-left px-2 py-1 text-xs text-default hover:bg-hover rounded-sm"
          >Open</button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { onMenuOpenChange(false); onRegenerate() }}
            className="block w-full text-left px-2 py-1 text-xs text-default hover:bg-hover rounded-sm"
          >Regenerate</button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { onMenuOpenChange(false); onDelete() }}
            className="block w-full text-left px-2 py-1 text-xs text-default hover:bg-hover rounded-sm"
          >Delete</button>
        </div>
      ) : undefined}
    >
      <button
        type="button"
        onClick={onOpen}
        title={entry.description || entry.name}
        className="flex-1 flex items-center gap-1.5 px-1.5 py-[3px] text-[12.5px] rounded-sm text-muted hover:bg-hover hover:text-default transition-colors text-left min-w-0"
      >
        <span className="flex-1 truncate">{entry.name}</span>
        {entry.stale && (
          <span aria-label="stale" title="This site is stale">
            <SidebarRowIcon icon={AlertTriangle} />
          </span>
        )}
      </button>
    </SidebarRowFrame>
  )
}
