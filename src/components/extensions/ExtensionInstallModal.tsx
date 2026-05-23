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
    <div
      data-testid="extension-install-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Install ${manifest.name}`}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      className="fixed inset-0 z-[9998] bg-black/50 flex items-start justify-center pt-20"
      tabIndex={-1}
    >
      <div className="bg-panel border border-default rounded-lg p-5 shadow-[var(--overlay-shadow)] min-w-[480px] max-w-[640px] max-h-[80vh] overflow-y-auto">
        <h2 className="mb-2 text-base">Install &quot;{manifest.name}&quot;?</h2>
        <div className="text-[11px] text-subtle mb-4">
          v{manifest.version} {manifest.author && `· by ${manifest.author}`}
        </div>
        {manifest.description && <p className="text-[13px] mb-3">{manifest.description}</p>}

        {hasLanguage && <LanguageRedConsentBanner extensionsHandled={languageExts} />}

        <Section title="Capabilities">
          {manifest.capabilities.length === 0
            ? <div className="text-[11px] text-subtle italic">No capabilities requested</div>
            : <ul className="list-none m-0 p-0 flex flex-wrap gap-1">
                {manifest.capabilities.map((c) => (
                  <li key={c} className={`text-[11px] px-2 py-0.5 rounded-sm text-default ${ELEVATED_CAPS.has(c) ? 'bg-warning-soft' : 'bg-elev'}`}>{c}</li>
                ))}
              </ul>}
        </Section>

        <Section title="Network">
          {manifest.network.length === 0
            ? <div className="text-[11px] text-subtle italic">No network access requested</div>
            : <ul className="list-none m-0 p-0 flex flex-wrap gap-1">
                {manifest.network.map((o) => <li key={o} className="text-[11px] px-2 py-0.5 rounded-sm text-default bg-elev font-mono">{o}</li>)}
              </ul>}
        </Section>

        <Section title="Adds to Canv">
          <div className="text-[11px] text-muted">
            {manifest.contributions.length === 0
              ? 'No UI contributions'
              : summariseContributions(manifest.contributions)}
          </div>
        </Section>

        <Section title="Source folder">
          <code className="text-[11px] text-muted">{sourceFolder}</code>
        </Section>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-secondary btn-sm">Cancel</button>
          <button
            type="button"
            onClick={onConfirm}
            className={hasLanguage ? 'btn-danger btn-sm' : 'btn-primary btn-sm'}
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
    <div className="mb-3">
      <div className="text-[11px] text-muted mb-1 uppercase tracking-wide">{title}</div>
      {children}
    </div>
  )
}
