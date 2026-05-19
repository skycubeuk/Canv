import type React from 'react'
import { LanguageRedConsentBanner } from './LanguageRedConsentBanner'
import { summariseContributions } from './summariseContributions'

export interface PreviewManifest {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  capabilities: string[]
  network: string[]
  settings?: unknown[]
  contributions: unknown[]
}

interface Props {
  sourceFolder: string
  manifest: PreviewManifest
  onCancel: () => void
  onConfirm: () => void
}

const ELEVATED_CAPS = new Set(['workspace.write', 'activeDoc.write', 'ai', 'net'])

export function ExtensionInstallModal({ sourceFolder, manifest, onCancel, onConfirm }: Props) {
  const languageContribs = (manifest.contributions as Array<{ type?: string; extensions?: string[] }>).filter((c) => c?.type === 'language')
  const languageExts = Array.from(new Set(languageContribs.flatMap((c) => c.extensions ?? [])))
  const hasLanguage = languageExts.length > 0

  return (
    <div role="dialog" aria-modal="true"
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      style={overlayStyle} tabIndex={-1}
    >
      <div style={modalStyle}>
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Install &quot;{manifest.name}&quot;?</h2>
        <div style={{ fontSize: 11, color: 'var(--text-color-subtle)', marginBottom: 16 }}>
          v{manifest.version} {manifest.author && `· by ${manifest.author}`}
        </div>
        {manifest.description && <p style={{ fontSize: 13, marginBottom: 12 }}>{manifest.description}</p>}

        {hasLanguage && <LanguageRedConsentBanner extensionsHandled={languageExts} />}

        <Section title="Capabilities">
          {manifest.capabilities.length === 0
            ? <div style={emptyStyle}>No capabilities requested</div>
            : <ul style={chipListStyle}>
                {manifest.capabilities.map((c) => (
                  <li key={c} style={chipStyle(ELEVATED_CAPS.has(c))}>{c}</li>
                ))}
              </ul>}
        </Section>

        <Section title="Network">
          {manifest.network.length === 0
            ? <div style={emptyStyle}>No network access requested</div>
            : <ul style={chipListStyle}>
                {manifest.network.map((o) => <li key={o} style={netChipStyle}>{o}</li>)}
              </ul>}
        </Section>

        <Section title="Adds to Canv">
          <div style={{ fontSize: 11, color: 'var(--text-color-muted)' }}>
            {manifest.contributions.length === 0
              ? 'No UI contributions'
              : summariseContributions(manifest.contributions)}
          </div>
        </Section>

        <Section title="Source folder">
          <code style={{ fontSize: 11, color: 'var(--text-color-muted)' }}>{sourceFolder}</code>
        </Section>

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onCancel} style={secondaryBtn}>Cancel</button>
          <button
            type="button"
            onClick={onConfirm}
            style={hasLanguage ? redConsentBtn : primaryBtn}
          >
            {hasLanguage ? 'I understand — install anyway' : 'Install to this workspace'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-color-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</div>
      {children}
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998,
  background: 'rgba(0, 0, 0, 0.5)',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  paddingTop: 80,
}
const modalStyle: React.CSSProperties = {
  background: 'var(--color-panel)', border: '1px solid var(--border-color-default)',
  borderRadius: 8, padding: 20, minWidth: 480, maxWidth: 640, maxHeight: '80vh', overflowY: 'auto',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
}
const chipListStyle: React.CSSProperties = {
  listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 4,
}
const chipStyle = (elevated: boolean): React.CSSProperties => ({
  fontSize: 11, padding: '2px 8px', borderRadius: 4,
  background: elevated ? 'rgb(180 100 0 / 30%)' : 'rgb(60 65 75 / 60%)',
  color: 'var(--text-color-default)',
})
const netChipStyle: React.CSSProperties = {
  fontSize: 11, padding: '2px 8px', borderRadius: 4,
  background: 'rgb(60 65 75 / 60%)', color: 'var(--text-color-default)',
  fontFamily: 'monospace',
}
const emptyStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-color-subtle)', fontStyle: 'italic',
}
const primaryBtn: React.CSSProperties = {
  background: 'rgb(99 102 241)', color: 'white', border: 'none',
  borderRadius: 4, padding: '8px 14px', cursor: 'pointer', font: 'inherit', fontSize: 12,
}
const secondaryBtn: React.CSSProperties = {
  background: 'var(--color-elev)', color: 'var(--text-color-default)',
  border: '1px solid var(--border-color-default)', borderRadius: 4,
  padding: '8px 14px', cursor: 'pointer', font: 'inherit', fontSize: 12,
}
const redConsentBtn: React.CSSProperties = {
  background: 'rgb(180 60 60)',
  color: 'white',
  border: '1px solid rgb(255 100 100)',
  borderRadius: 4,
  padding: '8px 14px',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 12,
  fontWeight: 600,
}
