import { useState } from 'react'

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
  running: boolean
  crashed?: boolean
  expanded: boolean
  onToggleEnabled: (enabled: boolean) => void
  onSetTrusted: (iso: string | null) => void
  onUninstall: () => void
  onReload: () => void
  onExpand: (expanded: boolean) => void
}

export function ExtensionRow({ entry, manifest, running, crashed, expanded, onToggleEnabled, onSetTrusted, onUninstall, onReload, onExpand }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const needsTrust = entry.trustedAt == null

  return (
    <li style={{ padding: '12px', borderBottom: '1px solid var(--border-color-default)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          aria-label={expanded ? 'collapse' : 'expand'}
          onClick={() => onExpand(!expanded)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-color-muted)' }}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>{manifest.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text-color-subtle)' }}>v{entry.version}</span>
            {needsTrust && <span style={badgeStyle('rgb(180 100 0 / 30%)')}>needs trust</span>}
            {crashed && <span style={badgeStyle('rgb(180 40 40 / 30%)')}>crashed</span>}
            {running && !crashed && <span style={badgeStyle('rgb(40 130 60 / 25%)')}>active</span>}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="enabled"
          aria-checked={entry.enabled}
          disabled={needsTrust}
          onClick={() => onToggleEnabled(!entry.enabled)}
          style={{
            padding: '4px 10px', borderRadius: 4, cursor: needsTrust ? 'not-allowed' : 'pointer',
            background: entry.enabled ? 'rgb(var(--accent))' : 'var(--color-elev)',
            color: entry.enabled ? 'white' : 'var(--text-color-muted)',
            border: '1px solid var(--border-color-default)', font: 'inherit', opacity: needsTrust ? 0.5 : 1,
          }}
        >{entry.enabled ? 'on' : 'off'}</button>
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            aria-label="more actions"
            onClick={() => setMenuOpen((v) => !v)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}
          >⋯</button>
          {menuOpen && (
            <div role="menu" style={{
              position: 'absolute', top: '100%', right: 0,
              background: 'var(--color-panel)', border: '1px solid var(--border-color-default)',
              borderRadius: 4, padding: 4, minWidth: 160, zIndex: 10,
            }}>
              {needsTrust ? (
                <button type="button" onClick={() => { setMenuOpen(false); onSetTrusted(new Date().toISOString()) }} style={menuItemStyle}>Trust this extension</button>
              ) : (
                <button type="button" onClick={() => { setMenuOpen(false); onSetTrusted(null) }} style={menuItemStyle}>Revoke trust</button>
              )}
              <button type="button" onClick={() => { setMenuOpen(false); onReload() }} style={menuItemStyle}>Reload</button>
              <button type="button" onClick={() => { setMenuOpen(false); if (confirm('Uninstall this extension?')) onUninstall() }} style={menuItemStyle}>Uninstall…</button>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

function badgeStyle(bg: string): React.CSSProperties {
  return { fontSize: 11, padding: '1px 6px', background: bg, borderRadius: 4 }
}

const menuItemStyle: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left',
  background: 'transparent', border: 'none',
  padding: '6px 8px', font: 'inherit', cursor: 'pointer', color: 'var(--text-color-default)',
}
