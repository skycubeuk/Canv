// src/components/builder/BuilderBoot.tsx
import { useEffect, useState, useCallback } from 'react'
import { BuilderShell } from './BuilderShell'

declare global {
  interface Window {
    extensionBuilderAPI?: {
      closeWindow: () => Promise<void>
      listSessions: () => Promise<Array<{ id: string; createdAt: string; updatedAt: string; builderPrompt: string }>>
      openSession: (id: string | null, opts?: { editingExtensionId?: string }) =>
        Promise<{ id: string; dir: string; history: Array<{ role: string; content: string }>; builderPrompt: string; editingExtensionId: string | null; manifest?: unknown }>
      appendHistory: (sessionId: string, message: { role: string; content: string }) => Promise<void>
      applyPayload: (sessionId: string, rawAiResponse: string) =>
        Promise<{ ok: true; manifest: unknown } | { ok: false; errors: string[] }>
      deleteSession: (sessionId: string) => Promise<void>
      spawnPreview: (sessionId: string, bounds: { x: number; y: number; width: number; height: number }) => Promise<{ ok: true; previewId: string }>
      destroyPreview: (sessionId: string) => Promise<void>
      setPreviewBounds: (sessionId: string, bounds: { x: number; y: number; width: number; height: number }) => Promise<void>
      exportTranscript: (payload: { defaultName?: string; content: string }) =>
        Promise<{ ok: true; path: string } | { ok: false; canceled?: boolean; error?: string }>
    }
  }
}

function readEditExtensionId(): string | null {
  const params = new URLSearchParams(window.location.search)
  const v = params.get('editExt')
  return v && v.length > 0 ? v : null
}

export function BuilderBoot() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const editId = readEditExtensionId()
    let cancelled = false
    void (async () => {
      try {
        const api = window.extensionBuilderAPI
        if (!api) { if (!cancelled) setError('extensionBuilderAPI not available'); return }
        const session = await api.openSession(null, editId ? { editingExtensionId: editId } : {})
        if (!cancelled) setSessionId(session.id)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const onClose = useCallback(() => {
    void window.extensionBuilderAPI?.closeWindow()
  }, [])

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: 'var(--font-sans, system-ui)', color: 'var(--text-color-default, white)' }}>
        <h2>Builder failed to start</h2>
        <pre style={{ color: 'rgb(255 120 120)' }}>{error}</pre>
      </div>
    )
  }

  if (!sessionId) {
    return <div style={{ padding: 24, color: 'var(--text-color-muted, #888)' }}>Starting Builder…</div>
  }

  return <BuilderShell sessionId={sessionId} onClose={onClose} />
}
