import type React from 'react'

interface ManifestSummary {
  capabilities: string[]
  network: string[]
  settings?: unknown[]
}

interface Props {
  manifestSummary: ManifestSummary | null
  errors: string[]
}

const ELEVATED_CAPS = new Set(['workspace.write', 'activeDoc.write', 'ai', 'net'])

export function BuilderRequestsPanel({ manifestSummary, errors }: Props) {
  return (
    <div style={{ borderTop: '1px solid var(--border-color-default)', padding: 12 }}>
      <div style={sectionHeader}>Capabilities</div>
      {!manifestSummary ? (
        <div style={emptyText}>No manifest yet — send a prompt to generate one.</div>
      ) : manifestSummary.capabilities.length === 0 ? (
        <div style={emptyText}>None requested</div>
      ) : (
        <ul style={chipList}>
          {manifestSummary.capabilities.map((c) => (
            <li key={c} style={chipStyle(ELEVATED_CAPS.has(c))}>{c}</li>
          ))}
        </ul>
      )}

      <div style={{ ...sectionHeader, marginTop: 12 }}>Network</div>
      {!manifestSummary ? (
        <div style={emptyText}>—</div>
      ) : manifestSummary.network.length === 0 ? (
        <div style={emptyText}>No outbound network</div>
      ) : (
        <ul style={chipList}>
          {manifestSummary.network.map((o) => (
            <li key={o} style={chipStyle(false)}>{o}</li>
          ))}
        </ul>
      )}

      {errors.length > 0 && (
        <>
          <div style={{ ...sectionHeader, marginTop: 12, color: 'rgb(255 120 120)' }}>Errors</div>
          <ul style={{ listStyle: 'disc', margin: 0, paddingLeft: 20, fontSize: 11, color: 'rgb(255 120 120)' }}>
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </>
      )}
    </div>
  )
}

const sectionHeader: React.CSSProperties = {
  fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5,
  color: 'var(--text-color-muted)', marginBottom: 4,
}
const emptyText: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-color-subtle)', fontStyle: 'italic',
}
const chipList: React.CSSProperties = {
  listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 4,
}
const chipStyle = (elevated: boolean): React.CSSProperties => ({
  fontSize: 11, padding: '2px 8px', borderRadius: 4,
  background: elevated ? 'rgb(180 100 0 / 30%)' : 'rgb(60 65 75 / 60%)',
  color: 'var(--text-color-default)',
})
