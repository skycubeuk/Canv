import { useEffect, useState, useCallback } from 'react'
import { ExtensionRow } from './ExtensionRow'
import { ExtensionSettingsForm } from './ExtensionSettingsForm'
import { ExtensionInstallModal } from './ExtensionInstallModal'
import type { PreviewManifest } from './ExtensionInstallModal'
import type { AllContributions } from '../../types/extension-contributions'

declare global {
  interface Window {
    canvExtensions?: {
      listInstalled: () => Promise<Array<{ id: string; version: string; manifestSha256: string; installedAt: string; enabled: boolean; trustedAt: string | null }>>
      install: (folder: string) => Promise<{ ok: boolean; id?: string; errors?: string[] }>
      uninstall: (id: string) => Promise<void>
      setEnabled: (id: string, enabled: boolean) => Promise<void>
      setTrustedAt: (id: string, iso: string | null) => Promise<void>
      getWorkspaceTrust: () => Promise<'trusted' | 'untrusted' | 'always-disabled'>
      setWorkspaceTrust: (s: 'trusted' | 'untrusted' | 'always-disabled') => Promise<void>
      readSettings: (id: string) => Promise<Record<string, unknown>>
      writeSetting: (id: string, key: string, value: unknown) => Promise<void>
      readManifest: (id: string) => Promise<{ id: string; name: string; version: string; capabilities: string[]; contributions: unknown[]; settings?: Array<{ key: string; type: string; default?: unknown; label?: string; description?: string; options?: string[]; min?: number; max?: number; step?: number }> }>
      reload: (id: string) => Promise<void>
      pickInstallFolder: () => Promise<string | null>
      previewInstall: (folder: string) => Promise<{ ok: true; manifest: PreviewManifest } | { ok: false; errors: string[] }>
      readAllContributions: () => Promise<AllContributions>
      onChanged: (cb: () => void) => () => void
      onCrashed: (cb: (payload: { id: string; reason: string }) => void) => () => void
      onPromptRequest?: (cb: (reqId: number, req: {
        kind: 'quickPick'; extensionId: string; items: { label: string; description?: string; value: unknown }[]; placeholder?: string
      } | {
        kind: 'input'; extensionId: string; prompt: string; placeholder?: string; defaultValue?: string
      }) => void) => () => void
      promptResolve?: (reqId: number, value: { value: unknown } | null) => void
      onMenu?: (cb: (msg: { action: string }) => void) => () => void
      onStatusBarChanged?: (cb: (p: unknown) => void) => () => void
      openBuilder?: (opts: { editExtension?: string }) => Promise<void>
      showPanelInSlot?: (slotId: string, bounds: { x: number; y: number; width: number; height: number }) => Promise<{ ok: boolean; error?: string }>
      hidePanelInSlot?: (slotId: string) => Promise<void>
      invokeCommand?: (commandId: string, args?: unknown) => Promise<{ ok: boolean; error?: string }>
      getFileHandlerDefaults?: () => Promise<Record<string, string>>
      setFileHandlerDefault?: (ext: string, extensionId: string | null) => Promise<void>
      showFileInExtension?: (extensionId: string, relPath: string, mode: 'viewer' | 'editor', bounds: { x: number; y: number; width: number; height: number }) => Promise<{ ok: boolean; error?: string }>
      hideFileInExtension?: (extensionId: string, relPath: string) => Promise<void>
    }
  }
}

interface Entry { id: string; version: string; manifestSha256: string; installedAt: string; enabled: boolean; trustedAt: string | null }
interface ManifestSummary { id: string; name: string; version: string; capabilities: string[]; contributions: unknown[]; settings?: Array<{ key: string; type: string; default?: unknown; label?: string; description?: string; options?: string[]; min?: number; max?: number; step?: number }> }

export function ExtensionsTab() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [manifests, setManifests] = useState<Record<string, ManifestSummary>>({})
  const [trust, setTrust] = useState<'trusted' | 'untrusted' | 'always-disabled'>('untrusted')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [settings, setSettings] = useState<Record<string, Record<string, unknown>>>({})
  const [installError, setInstallError] = useState<string | null>(null)
  const [crashedIds, setCrashedIds] = useState<Set<string>>(new Set())
  const [pendingInstall, setPendingInstall] = useState<{ folder: string; manifest: PreviewManifest } | null>(null)

  const refresh = useCallback(async () => {
    const dev = window.canvExtensions
    if (!dev) return
    const list = await dev.listInstalled()
    setEntries(list)
    setTrust(await dev.getWorkspaceTrust())
    const ms: Record<string, ManifestSummary> = {}
    await Promise.all(list.map(async (e) => {
      try { ms[e.id] = await dev.readManifest(e.id) }
      catch { /* extension dir may be missing; skip */ }
    }))
    setManifests(ms)
  }, [])

  useEffect(() => {
    let cancelled = false
    const dev = window.canvExtensions
    if (dev) {
      void (async () => {
        const list = await dev.listInstalled()
        if (cancelled) return
        setEntries(list)
        const trust = await dev.getWorkspaceTrust()
        if (cancelled) return
        setTrust(trust)
        const ms: Record<string, ManifestSummary> = {}
        await Promise.all(list.map(async (e) => {
          try { ms[e.id] = await dev.readManifest(e.id) }
          catch { /* extension dir may be missing; skip */ }
        }))
        if (cancelled) return
        setManifests(ms)
      })()
    }
    const off = dev?.onChanged(() => { void refresh() })
    return () => { cancelled = true; off?.() }
  }, [refresh])

  useEffect(() => {
    if (!expanded) return
    void window.canvExtensions?.readSettings(expanded).then((v) => {
      setSettings((s) => ({ ...s, [expanded]: v }))
    })
  }, [expanded])

  useEffect(() => {
    const off = window.canvExtensions?.onCrashed((payload) => {
      setCrashedIds((prev) => {
        const next = new Set(prev)
        next.add(payload.id)
        return next
      })
    })
    return () => { off?.() }
  }, [])

  const onInstall = useCallback(async () => {
    setInstallError(null)
    const folder = await window.canvExtensions?.pickInstallFolder()
    if (!folder) return
    const preview = await window.canvExtensions?.previewInstall(folder)
    if (!preview?.ok) {
      setInstallError((preview?.errors || ['preview failed']).join('; '))
      return
    }
    setPendingInstall({ folder, manifest: preview.manifest })
  }, [])

  const onConfirmInstall = useCallback(async () => {
    if (!pendingInstall) return
    const r = await window.canvExtensions?.install(pendingInstall.folder)
    if (r && !r.ok) setInstallError((r.errors || ['unknown error']).join('; '))
    setPendingInstall(null)
  }, [pendingInstall])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {pendingInstall && (
        <ExtensionInstallModal
          sourceFolder={pendingInstall.folder}
          manifest={pendingInstall.manifest}
          onCancel={() => setPendingInstall(null)}
          onConfirm={() => void onConfirmInstall()}
        />
      )}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color-default)', fontSize: 11, color: 'var(--text-color-muted)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Workspace trust: <strong style={{ color: trust === 'trusted' ? 'rgb(80 180 100)' : 'var(--text-color-default)' }}>{trust}</strong></span>
          {trust === 'trusted' && (
            <button
              type="button"
              onClick={() => {
                if (confirm('Revoke trust for this workspace? All currently-running extensions will stop.')) {
                  void window.canvExtensions?.setWorkspaceTrust('untrusted')
                }
              }}
              style={{ ...secondaryBtn, marginLeft: 'auto' }}
            >Revoke trust</button>
          )}
        </div>
        {trust !== 'trusted' && entries.length > 0 && (
          <div style={{ marginTop: 6, padding: 6, background: 'rgb(180 100 0 / 15%)', borderRadius: 4 }}>
            <div style={{ marginBottom: 4 }}>This workspace contains {entries.length} extension{entries.length === 1 ? '' : 's'}. They will not run until you trust this workspace.</div>
            <button type="button" onClick={() => void window.canvExtensions?.setWorkspaceTrust('trusted')} style={primaryBtn}>Trust this workspace</button>
            <button type="button" onClick={() => void window.canvExtensions?.setWorkspaceTrust('always-disabled')} style={{ ...secondaryBtn, marginLeft: 6 }}>Always disable</button>
          </div>
        )}
        {trust === 'always-disabled' && (
          <div style={{ marginTop: 6, padding: 6, background: 'rgb(180 100 0 / 15%)', borderRadius: 4 }}>
            <div style={{ marginBottom: 4 }}>Extensions are permanently disabled for this workspace.</div>
            <button type="button" onClick={() => void window.canvExtensions?.setWorkspaceTrust('untrusted')} style={secondaryBtn}>Reset to untrusted</button>
          </div>
        )}
      </div>
      {entries.length === 0 ? (
        <div style={{ padding: 16, color: 'var(--text-color-subtle)', fontSize: 12 }}>No extensions installed in this workspace yet.</div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: 1, overflowY: 'auto' }}>
          {entries.map((e) => {
            const m = manifests[e.id]
            if (!m) return null
            const isOpen = expanded === e.id
            return (
              <div key={e.id}>
                <ExtensionRow
                  entry={e}
                  manifest={m}
                  running={false}
                  crashed={crashedIds.has(e.id)}
                  expanded={isOpen}
                  onToggleEnabled={(en) => {
                    // Clear stale crashed badge on either toggle direction: disabling
                    // destroys the (crashed) renderer; re-enabling spawns a fresh one.
                    setCrashedIds((prev) => {
                      if (!prev.has(e.id)) return prev
                      const next = new Set(prev)
                      next.delete(e.id)
                      return next
                    })
                    void window.canvExtensions?.setEnabled(e.id, en)
                  }}
                  onSetTrusted={(iso) => void window.canvExtensions?.setTrustedAt(e.id, iso)}
                  onUninstall={() => void window.canvExtensions?.uninstall(e.id)}
                  onReload={() => {
                    setCrashedIds((prev) => {
                      const next = new Set(prev)
                      next.delete(e.id)
                      return next
                    })
                    void window.canvExtensions?.reload(e.id)
                  }}
                  onExpand={(open) => setExpanded(open ? e.id : null)}
                  onEditInBuilder={() => void window.canvExtensions?.openBuilder?.({ editExtension: e.id })}
                />
                {isOpen && (
                  <div style={{ padding: '8px 12px 16px 32px', background: 'var(--color-app, var(--color-panel))' }}>
                    <ExtensionSettingsForm
                      settings={(m.settings ?? []) as never}
                      values={settings[e.id] ?? {}}
                      onChange={(key, value) => {
                        void window.canvExtensions?.writeSetting(e.id, key, value).then(() => {
                          setSettings((s) => ({ ...s, [e.id]: { ...(s[e.id] ?? {}), [key]: value } }))
                        })
                      }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </ul>
      )}
      <div style={{ padding: 12, borderTop: '1px solid var(--border-color-default)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => void onInstall()} style={primaryBtn}>Install from folder…</button>
        <button
          type="button"
          onClick={() => void window.canvExtensions?.openBuilder?.({})}
          style={secondaryBtn}
        >Build new…</button>
        {installError && <div style={{ marginTop: 8, color: 'rgb(255 120 120)', fontSize: 11, flexBasis: '100%' }}>{installError}</div>}
      </div>
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  background: 'rgb(99 102 241)', color: 'white', border: 'none',
  borderRadius: 4, padding: '6px 10px', cursor: 'pointer', font: 'inherit', fontSize: 12,
}
const secondaryBtn: React.CSSProperties = {
  background: 'var(--color-elev)', color: 'var(--text-color-default)',
  border: '1px solid var(--border-color-default)', borderRadius: 4, padding: '6px 10px',
  cursor: 'pointer', font: 'inherit', fontSize: 12,
}
