import { useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import { ExtensionRow } from './ExtensionRow'
import { ExtensionSettingsForm } from './ExtensionSettingsForm'
import { ExtensionInstallModal } from './ExtensionInstallModal'
import type { PreviewManifest } from './ExtensionInstallModal'
import type { AllContributions } from '../../types/extension-contributions'
import { SidebarEmpty } from '../ide/sidebar/SidebarChrome'

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
      pickInstallFile: () => Promise<string | null>
      previewInstall: (source: string) => Promise<{ ok: true; manifest: PreviewManifest } | { ok: false; errors: string[] }>
      readAllContributions: () => Promise<AllContributions>
      onChanged: (cb: () => void) => () => void
      onCrashed: (cb: (payload: { id: string; reason: string }) => void) => () => void
      onPromptRequest?: (cb: (reqId: number, req: {
        kind: 'quickPick'; extensionId: string; items: { label: string; description?: string; value: unknown }[]; placeholder?: string
      } | {
        kind: 'input'; extensionId: string; prompt: string; placeholder?: string; defaultValue?: string
      }) => void) => () => void
      promptResolve?: (reqId: number, value: { value: unknown } | null) => void
      onStatusBarChanged?: (cb: (p: unknown) => void) => () => void
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

export interface ExtensionsTabHandle {
  installFromFolder: () => void
  installFromFile: () => void
}

export const ExtensionsTab = forwardRef<ExtensionsTabHandle, object>(function ExtensionsTab(_, ref) {
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
        const t = await dev.getWorkspaceTrust()
        if (cancelled) return
        setTrust(t)
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

  const onInstallFromFolder = useCallback(async () => {
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

  const onInstallFromFile = useCallback(async () => {
    setInstallError(null)
    const file = await window.canvExtensions?.pickInstallFile()
    if (!file) return
    const preview = await window.canvExtensions?.previewInstall(file)
    if (!preview?.ok) {
      setInstallError((preview?.errors || ['preview failed']).join('; '))
      return
    }
    setPendingInstall({ folder: file, manifest: preview.manifest })
  }, [])

  const onConfirmInstall = useCallback(async () => {
    if (!pendingInstall) return
    const r = await window.canvExtensions?.install(pendingInstall.folder)
    if (r && !r.ok) setInstallError((r.errors || ['unknown error']).join('; '))
    setPendingInstall(null)
  }, [pendingInstall])

  useImperativeHandle(ref, () => ({
    installFromFolder: () => { void onInstallFromFolder() },
    installFromFile: () => { void onInstallFromFile() },
  }), [onInstallFromFolder, onInstallFromFile])

  return (
    <div className="h-full flex flex-col">
      {pendingInstall && (
        <ExtensionInstallModal
          sourceFolder={pendingInstall.folder}
          manifest={pendingInstall.manifest}
          onCancel={() => setPendingInstall(null)}
          onConfirm={() => void onConfirmInstall()}
        />
      )}

      {trust !== 'trusted' && entries.length > 0 && (
        <div className="mx-3 mt-2 mb-1 p-2 text-xs rounded-sm border border-warning bg-warning-soft">
          <div className="mb-1.5 text-default">
            This workspace contains {entries.length} extension{entries.length === 1 ? '' : 's'}. They will not run until you trust this workspace.
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => void window.canvExtensions?.setWorkspaceTrust('trusted')}
              className="btn-primary btn-sm"
            >Trust this workspace</button>
            <button
              type="button"
              onClick={() => void window.canvExtensions?.setWorkspaceTrust('always-disabled')}
              className="btn-secondary btn-sm"
            >Always disable</button>
          </div>
        </div>
      )}
      {trust === 'always-disabled' && (
        <div className="mx-3 mt-2 mb-1 p-2 text-xs rounded-sm border border-warning bg-warning-soft">
          <div className="mb-1.5 text-default">Extensions are permanently disabled for this workspace.</div>
          <button
            type="button"
            onClick={() => void window.canvExtensions?.setWorkspaceTrust('untrusted')}
            className="btn-secondary btn-sm"
          >Reset to untrusted</button>
        </div>
      )}
      {trust === 'trusted' && (
        <div className="mx-3 mt-2 mb-1 text-[10.5px] text-subtle">
          Workspace trust: <strong className="text-default">trusted</strong>
          <button
            type="button"
            className="ml-2 text-subtle hover:text-default underline-offset-2 hover:underline"
            onClick={() => {
              if (confirm('Revoke trust for this workspace? All currently-running extensions will stop.')) {
                void window.canvExtensions?.setWorkspaceTrust('untrusted')
              }
            }}
          >Revoke</button>
        </div>
      )}

      {entries.length === 0 ? (
        <SidebarEmpty>No extensions installed in this workspace yet.</SidebarEmpty>
      ) : (
        <ul className="flex-1 overflow-y-auto py-1 m-0 p-0 list-none">
          {entries.map((e) => {
            const m = manifests[e.id]
            if (!m) return null
            const isOpen = expanded === e.id
            return (
              <div key={e.id}>
                <ExtensionRow
                  entry={e}
                  manifest={m}
                  crashed={crashedIds.has(e.id)}
                  expanded={isOpen}
                  onToggleEnabled={(en) => {
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
                />
                {isOpen && (
                  <div className="px-3 py-2 pl-10 bg-panel">
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

      {installError && (
        <div className="px-3 py-1 text-xs text-danger-fg border-t border-default">{installError}</div>
      )}
    </div>
  )
})
