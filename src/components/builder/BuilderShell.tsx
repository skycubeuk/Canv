import { useState, useCallback, useEffect } from 'react'
import { useSettings } from '../../hooks/useSettings'
import { useModesState } from '../../hooks/useModes'
import { useLocalStorage } from '../../hooks/useLocalStorage'
import { getAdapter } from '../../adapters'
import { ExtensionInstallModal } from '../extensions/ExtensionInstallModal'
import type { PreviewManifest } from '../extensions/ExtensionInstallModal'
import { BuilderChat } from './BuilderChat'
import { BuilderRequestsPanel } from './BuilderRequestsPanel'
import { BuilderPreviewSlot } from './BuilderPreviewSlot'
import { buildTranscriptMarkdown } from './buildTranscript'
import systemPromptRaw from '../../agents/extensionBuilder.system.md?raw'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ManifestSummary {
  capabilities: string[]
  network: string[]
  settings?: unknown[]
}

interface Session {
  id: string
  dir: string
  history: ChatMessage[]
  manifest?: { capabilities?: string[]; network?: string[]; settings?: unknown[] } & Record<string, unknown>
}

interface Props {
  sessionId: string
  onClose: () => void
}

export function BuilderShell({ sessionId, onClose }: Props) {
  const { settings } = useSettings()
  const modesState = useModesState()
  const [profileId] = useLocalStorage<string | null>('canv:profile', null)

  // Resolve active profile from modes state — may be undefined while loading.
  const modes = modesState.status === 'ready' ? modesState.modes : []
  const defaultModeId = modesState.status === 'ready' ? modesState.defaultModeId : null
  const activeProfileId = profileId ?? defaultModeId
  const activeProfile =
    modes.find((m) => m.id === activeProfileId) ??
    (defaultModeId ? modes.find((m) => m.id === defaultModeId) : undefined)

  const [session, setSession] = useState<Session | null>(null)
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [manifestSummary, setManifestSummary] = useState<ManifestSummary | null>(null)
  const [pending, setPending] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [previewSpawned, setPreviewSpawned] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const [pendingInstall, setPendingInstall] = useState<{ folder: string; manifest: PreviewManifest } | null>(null)

  // Load session on mount; destroy preview on unmount.
  useEffect(() => {
    const api = window.extensionBuilderAPI
    if (!api) return
    let cancelled = false
    void (async () => {
      const s = await api.openSession(sessionId, {})
      if (cancelled) return
      setSession(s as Session)
      setHistory(s.history as ChatMessage[])
      if (s.manifest) {
        const m = s.manifest as { capabilities?: string[]; network?: string[]; settings?: unknown[] }
        setManifestSummary({
          capabilities: m.capabilities ?? [],
          network: m.network ?? [],
          settings: m.settings,
        })
        // Re-spawn preview for sessions that already have a manifest.
        try {
          await api.spawnPreview(sessionId, { x: 600, y: 60, width: 580, height: 700 })
          if (!cancelled) setPreviewSpawned(true)
        } catch {
          // Preview failed — user can re-iterate to respawn.
        }
      }
    })()
    return () => {
      cancelled = true
      void window.extensionBuilderAPI?.destroyPreview(sessionId)
    }
  }, [sessionId])

  const onSend = useCallback(async (userText: string) => {
    const api = window.extensionBuilderAPI
    if (!api || pending || !userText.trim()) return
    setPending(true)
    setErrors([])

    const userMsg: ChatMessage = { role: 'user', content: userText.trim() }
    setHistory((h) => [...h, userMsg])
    await api.appendHistory(sessionId, userMsg)

    try {
      const provider = settings.provider
      const apiKey = settings.apiKeys[provider]
      if (!apiKey) throw new Error(`no API key configured for provider "${provider}"`)
      const adapter = getAdapter(provider)

      // Capture current history before state update — the setState above is async.
      // We pass history (the closure value) + userMsg since state may not have updated yet.
      const result = await adapter.complete({
        model: settings.defaultModel[provider],
        apiKey,
        baseUrl: settings.baseUrls?.[provider],
        system: systemPromptRaw,
        messages: [
          ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          { role: 'user' as const, content: userText.trim() },
        ],
        maxTokens: 4096,
      })

      const assistantMsg: ChatMessage = { role: 'assistant', content: result.text }
      setHistory((h) => [...h, assistantMsg])
      await api.appendHistory(sessionId, assistantMsg)

      const apply = await api.applyPayload(sessionId, result.text)
      if (apply.ok) {
        const m = apply.manifest as { capabilities?: string[]; network?: string[]; settings?: unknown[] }
        setManifestSummary({
          capabilities: m.capabilities ?? [],
          network: m.network ?? [],
          settings: m.settings,
        })
        setErrors([])
        await api.destroyPreview(sessionId)
        await api.spawnPreview(sessionId, { x: 600, y: 60, width: 580, height: 700 })
        setPreviewSpawned(true)
      } else {
        setErrors(apply.errors)
      }
    } catch (e) {
      setErrors([(e as Error).message])
    } finally {
      setPending(false)
    }
  }, [sessionId, pending, history, settings])

  const onInstallClick = useCallback(async () => {
    if (!session) return
    setInstallError(null)
    const preview = await window.canvExtensions?.previewInstall(session.dir)
    if (!preview?.ok) {
      const errs = !preview ? ['previewInstall not available'] : (preview.errors ?? ['preview failed'])
      setInstallError(errs.join('; '))
      return
    }
    // The preview is a native WebContentsView overlay that sits ABOVE the DOM,
    // so it would cover the install modal. Hide it (destroy) while the modal
    // is visible; respawn on cancel.
    await window.extensionBuilderAPI?.destroyPreview(sessionId)
    setPreviewSpawned(false)
    setPendingInstall({ folder: session.dir, manifest: preview.manifest })
  }, [session, sessionId])

  const onConfirmInstall = useCallback(async () => {
    if (!pendingInstall || !session) return
    const r = await window.canvExtensions?.install(pendingInstall.folder)
    if (r && !r.ok) {
      setInstallError((r.errors ?? ['install failed']).join('; '))
      setPendingInstall(null)
      return
    }
    setPendingInstall(null)
    await window.extensionBuilderAPI?.destroyPreview(sessionId)
    await window.extensionBuilderAPI?.deleteSession(sessionId)
    onClose()
  }, [pendingInstall, session, sessionId, onClose])

  const onFixWithAi = useCallback(() => {
    if (errors.length === 0 || pending) return
    const list = errors.map((e) => `- ${e}`).join('\n')
    const msg = `The payload you just produced failed validation:\n\n${list}\n\nRegenerate the entire payload (manifest + files) with these errors fixed. Bump the patch version. Output ONLY the JSON object.`
    void onSend(msg)
  }, [errors, pending, onSend])

  const [exportError, setExportError] = useState<string | null>(null)
  const onExportTranscript = useCallback(async () => {
    setExportError(null)
    if (!session) return
    const provider = settings.provider
    const model = settings.defaultModel[provider]
    const md = buildTranscriptMarkdown({
      sessionId: session.id,
      sessionDir: session.dir,
      provider,
      model,
      systemPrompt: systemPromptRaw,
      history,
      errors,
      manifest: manifestSummary,
    })
    const safeId = session.id.replace(/[^a-z0-9_-]/gi, '').slice(0, 12) || 'session'
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const defaultName = `canv-builder-${safeId}-${ts}.md`
    const r = await window.extensionBuilderAPI?.exportTranscript({ defaultName, content: md })
    if (!r) { setExportError('export API not available'); return }
    if (!r.ok && !r.canceled) setExportError(r.error || 'export failed')
  }, [session, settings, history, errors, manifestSummary])

  const onDiscard = useCallback(async () => {
    if (!confirm('Discard this session? All progress will be lost.')) return
    await window.extensionBuilderAPI?.destroyPreview(sessionId)
    await window.extensionBuilderAPI?.deleteSession(sessionId)
    onClose()
  }, [sessionId, onClose])

  const onPreviewBoundsChanged = useCallback(
    (bounds: { x: number; y: number; width: number; height: number }) => {
      if (!previewSpawned) return
      void window.extensionBuilderAPI?.setPreviewBounds(sessionId, bounds)
    },
    [sessionId, previewSpawned],
  )

  if (!session) {
    return (
      <div style={{ padding: 16, color: 'var(--text-color-muted)' }}>Loading session…</div>
    )
  }

  // Unused — activeProfile is reserved for future use (e.g. system prompt
  // injection from the user's active writing profile). Remove the lint warning.
  void activeProfile

  return (
    <div style={shellStyle}>
      <div style={leftPaneStyle}>
        <div style={headerStyle}>
          <strong>Extension Builder</strong>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-color-subtle)' }}>
            {session.id.slice(0, 8)}
          </span>
        </div>
        <BuilderChat
          history={history}
          pending={pending}
          onSend={(text) => { void onSend(text) }}
        />
        <BuilderRequestsPanel
          manifestSummary={manifestSummary}
          errors={errors}
          onFixWithAi={onFixWithAi}
          fixDisabled={pending}
        />
        <div style={footerStyle}>
          <button
            type="button"
            onClick={() => { void onExportTranscript() }}
            style={secondaryBtn}
            title="Save a Markdown transcript of this session (chat, system prompt, errors, files)"
          >
            Export…
          </button>
          <button type="button" onClick={() => { void onDiscard() }} style={secondaryBtn}>
            Discard
          </button>
          <button type="button" onClick={onClose} style={secondaryBtn}>
            Close
          </button>
          <button
            type="button"
            onClick={() => { void onInstallClick() }}
            disabled={!manifestSummary}
            style={{
              ...primaryBtn,
              opacity: manifestSummary ? 1 : 0.5,
              cursor: manifestSummary ? 'pointer' : 'not-allowed',
            }}
          >
            Install
          </button>
        </div>
        {installError && <div style={errorStyle}>{installError}</div>}
        {exportError && <div style={errorStyle}>Export: {exportError}</div>}
      </div>
      <BuilderPreviewSlot
        sessionId={sessionId}
        hasManifest={!!manifestSummary}
        onBoundsChanged={onPreviewBoundsChanged}
      />
      {pendingInstall && (
        <ExtensionInstallModal
          sourceFolder={pendingInstall.folder}
          manifest={pendingInstall.manifest}
          onCancel={() => {
            setPendingInstall(null)
            // Restore the preview that we hid before showing the modal.
            void (async () => {
              try {
                await window.extensionBuilderAPI?.spawnPreview(sessionId, { x: 600, y: 60, width: 580, height: 700 })
                setPreviewSpawned(true)
              } catch { /* ignore — user can re-iterate */ }
            })()
          }}
          onConfirm={() => { void onConfirmInstall() }}
        />
      )}
    </div>
  )
}

const shellStyle: React.CSSProperties = {
  display: 'flex',
  width: '100vw',
  height: '100vh',
  background: 'var(--color-app, #0a0b0d)',
  color: 'var(--text-color-default, white)',
  font: 'inherit',
}

const leftPaneStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: 560,
  minWidth: 400,
  maxWidth: 700,
  borderRight: '1px solid var(--border-color-default)',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 12px',
  borderBottom: '1px solid var(--border-color-default)',
  fontSize: 13,
}

const footerStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  padding: 12,
  borderTop: '1px solid var(--border-color-default)',
  justifyContent: 'flex-end',
}

const errorStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 11,
  color: 'rgb(255 120 120)',
}

const primaryBtn: React.CSSProperties = {
  background: 'rgb(99 102 241)',
  color: 'white',
  border: 'none',
  borderRadius: 4,
  padding: '6px 14px',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 12,
}

const secondaryBtn: React.CSSProperties = {
  background: 'var(--color-elev)',
  color: 'var(--text-color-default)',
  border: '1px solid var(--border-color-default)',
  borderRadius: 4,
  padding: '6px 14px',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 12,
}
