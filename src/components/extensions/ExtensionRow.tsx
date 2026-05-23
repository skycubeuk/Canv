import { useEffect, useRef, useState } from 'react'
import { ChevronRight, ChevronDown, Circle, CircleDot, AlertTriangle, ShieldAlert, MoreVertical } from 'lucide-react'
import { SidebarIconButton, SidebarRowFrame } from '../ide/sidebar/SidebarChrome'

interface RegistryEntry {
  id: string; version: string; manifestSha256: string; installedAt: string
  enabled: boolean; trustedAt: string | null
}

interface ManifestSummary {
  id: string; name: string; version: string; capabilities: string[]; contributions: unknown[]
}

interface Props {
  entry: RegistryEntry
  manifest: ManifestSummary
  crashed?: boolean
  expanded: boolean
  onToggleEnabled: (enabled: boolean) => void
  onSetTrusted: (iso: string | null) => void
  onUninstall: () => void
  onReload: () => void
  onExpand: (expanded: boolean) => void
}

export function ExtensionRow({
  entry, manifest, crashed, expanded,
  onToggleEnabled, onSetTrusted, onUninstall, onReload, onExpand,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const needsTrust = entry.trustedAt == null

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (triggerRef.current && e.target instanceof Node && triggerRef.current.contains(e.target)) return
      if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
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
        <>
          <SidebarIconButton
            aria-label={expanded ? 'collapse' : 'expand'}
            icon={expanded ? ChevronDown : ChevronRight}
            onClick={() => onExpand(!expanded)}
          />
          <button
            type="button"
            role="switch"
            aria-label="enabled"
            aria-checked={entry.enabled}
            disabled={needsTrust}
            onClick={() => onToggleEnabled(!entry.enabled)}
            className="w-[22px] h-[22px] grid place-items-center rounded-sm text-subtle hover:bg-hover hover:text-default disabled:opacity-50 disabled:cursor-not-allowed"
            title={needsTrust ? 'Trust this extension to enable it' : entry.enabled ? 'Disable' : 'Enable'}
          >
            {entry.enabled
              ? <CircleDot aria-hidden className="w-3 h-3 text-accent" />
              : <Circle aria-hidden className="w-3 h-3" />}
          </button>
        </>
      }
      trailing={
        <SidebarIconButton
          ref={triggerRef}
          aria-label="more actions"
          icon={MoreVertical}
          onClick={() => setMenuOpen((v) => !v)}
        />
      }
      menu={menuOpen ? (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-1 top-full z-30 bg-elev border border-default rounded-sm shadow-lg p-1 min-w-[160px]"
        >
          {needsTrust ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenuOpen(false); onSetTrusted(new Date().toISOString()) }}
              className="block w-full text-left px-2 py-1 text-xs text-default hover:bg-hover rounded-sm"
            >Trust this extension</button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenuOpen(false); onSetTrusted(null) }}
              className="block w-full text-left px-2 py-1 text-xs text-default hover:bg-hover rounded-sm"
            >Revoke trust</button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => { setMenuOpen(false); onReload() }}
            className="block w-full text-left px-2 py-1 text-xs text-default hover:bg-hover rounded-sm"
          >Reload</button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setMenuOpen(false); if (confirm('Uninstall this extension?')) onUninstall() }}
            className="block w-full text-left px-2 py-1 text-xs text-default hover:bg-hover rounded-sm"
          >Uninstall…</button>
        </div>
      ) : undefined}
    >
      <span className="flex-1 truncate text-[12.5px] text-default px-1.5">
        {manifest.name}
      </span>
      <span className="text-[10px] font-mono text-subtle tabular-nums shrink-0 px-1">
        v{entry.version}
      </span>
      {needsTrust && (
        <span aria-label="needs trust" title="Needs trust">
          <ShieldAlert aria-hidden className="w-3 h-3 text-warning-fg shrink-0" />
        </span>
      )}
      {crashed && (
        <span aria-label="crashed" title="Extension crashed">
          <AlertTriangle aria-hidden className="w-3 h-3 text-danger-fg shrink-0 ml-1" />
        </span>
      )}
    </SidebarRowFrame>
  )
}
