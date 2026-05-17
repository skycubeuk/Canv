import { useEffect, useRef, useState, useCallback } from 'react'
import type { EditorView } from '@codemirror/view'

declare global {
  interface Window {
    canvExtensionsDev?: {
      spawnTest: (fixtureName: string, bounds: { x: number; y: number; width: number; height: number }) => Promise<{ ok: boolean; id: string }>
      destroyTest: (id: string) => Promise<void>
      setBounds: (id: string, bounds: { x: number; y: number; width: number; height: number }) => Promise<void>
      onNotification: (cb: (n: { message: string; kind: 'info' | 'warn' | 'error'; extensionId: string }) => void) => () => void
      onHostRequest: (cb: (reqId: number, method: string, args: unknown[]) => void) => () => void
      hostReply: (reqId: number, ok: boolean, payload: unknown) => void
      fireEvent: (type: string, payload: unknown) => Promise<void>
    }
  }
}

const FIXTURE_ID = 'hello-world'
const FLAG_KEY = 'canv:extensions:devFlagOn'

function devFlagOn(): boolean {
  try { return window.localStorage.getItem(FLAG_KEY) === '1' } catch { return false }
}

function computeBounds() {
  return {
    x: window.innerWidth - 380,
    y: 80,
    width: 360,
    height: Math.min(700, window.innerHeight - 200),
  }
}

export interface TestExtensionOverlayProps {
  /** Returns the active CodeMirror EditorView, or null when no doc is open. */
  getActiveEditor: () => EditorView | null
  /** relPath of the currently active markdown file, or null. */
  activeMarkdownRel: string | null
}

export function TestExtensionOverlay({ getActiveEditor, activeMarkdownRel }: TestExtensionOverlayProps) {
  const [enabled, setEnabled] = useState(devFlagOn)
  const [spawned, setSpawned] = useState(false)
  const [notice, setNotice] = useState<{ msg: string; kind: string } | null>(null)

  // Use refs so that the IPC subscription effect (which runs once on mount)
  // always reads the latest editor state without stale closures.
  const getActiveEditorRef = useRef(getActiveEditor)
  const activeMarkdownRelRef = useRef(activeMarkdownRel)
  useEffect(() => { getActiveEditorRef.current = getActiveEditor }, [getActiveEditor])
  useEffect(() => { activeMarkdownRelRef.current = activeMarkdownRel }, [activeMarkdownRel])

  // Watch cross-tab changes to the dev flag (initial value comes from useState's lazy initialiser).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === FLAG_KEY) setEnabled(devFlagOn())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Subscribe to notifications and host-RPC requests whenever the flag is on.
  useEffect(() => {
    if (!enabled || !window.canvExtensionsDev) return
    const dev = window.canvExtensionsDev

    const offN = dev.onNotification((n) => {
      setNotice({ msg: `${n.extensionId}: ${n.message}`, kind: n.kind })
      setTimeout(() => setNotice(null), 4000)
    })

    const offR = dev.onHostRequest((reqId, method, args) => {
      try {
        const view = getActiveEditorRef.current()

        if (method === 'activeDoc.getText') {
          const text = view ? view.state.doc.toString() : ''
          dev.hostReply(reqId, true, text)
        } else if (method === 'activeDoc.getPath') {
          dev.hostReply(reqId, true, activeMarkdownRelRef.current ?? null)
        } else if (method === 'activeDoc.getSelection') {
          if (!view) {
            dev.hostReply(reqId, true, { from: 0, to: 0, text: '' })
          } else {
            const sel = view.state.selection.main
            const text = view.state.sliceDoc(sel.from, sel.to)
            dev.hostReply(reqId, true, { from: sel.from, to: sel.to, text })
          }
        } else if (method === 'activeDoc.insertAtCursor') {
          if (!view) {
            dev.hostReply(reqId, false, 'no active editor')
          } else {
            const insertText = typeof args[0] === 'string' ? args[0] : ''
            const sel = view.state.selection.main
            view.dispatch({
              changes: { from: sel.from, to: sel.from, insert: insertText },
              selection: { anchor: sel.from + insertText.length },
            })
            dev.hostReply(reqId, true, null)
          }
        } else if (method === 'activeDoc.replaceSelection') {
          if (!view) {
            dev.hostReply(reqId, false, 'no active editor')
          } else {
            const replaceText = typeof args[0] === 'string' ? args[0] : ''
            const sel = view.state.selection.main
            view.dispatch({
              changes: { from: sel.from, to: sel.to, insert: replaceText },
              selection: { anchor: sel.from + replaceText.length },
            })
            dev.hostReply(reqId, true, null)
          }
        } else if (method === 'activeDoc.setText') {
          if (!view) {
            dev.hostReply(reqId, false, 'no active editor')
          } else {
            const newText = typeof args[0] === 'string' ? args[0] : ''
            const docLength = view.state.doc.length
            view.dispatch({
              changes: { from: 0, to: docLength, insert: newText },
            })
            dev.hostReply(reqId, true, null)
          }
        } else {
          dev.hostReply(reqId, false, `unknown host method: ${method}`)
        }
      } catch (e) {
        dev.hostReply(reqId, false, (e as Error).message)
      }
    })

    return () => {
      offN()
      offR()
    }
  }, [enabled])

  // Keep extension view bounds in sync with window resizes.
  useEffect(() => {
    if (!spawned) return
    const onResize = () => {
      window.canvExtensionsDev?.setBounds(FIXTURE_ID, computeBounds())
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [spawned])

  // Destroy on unmount if still spawned.
  const spawnedRef = useRef(spawned)
  useEffect(() => { spawnedRef.current = spawned }, [spawned])
  useEffect(() => {
    return () => {
      if (spawnedRef.current) {
        void window.canvExtensionsDev?.destroyTest(FIXTURE_ID)
      }
    }
  }, [])

  const onToggle = useCallback(async () => {
    if (!window.canvExtensionsDev) return
    if (spawned) {
      await window.canvExtensionsDev.destroyTest(FIXTURE_ID)
      setSpawned(false)
    } else {
      await window.canvExtensionsDev.spawnTest(FIXTURE_ID, computeBounds())
      setSpawned(true)
    }
  }, [spawned])

  if (!enabled) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'flex-end',
      }}
    >
      <button
        type="button"
        onClick={() => { void onToggle() }}
        style={{
          background: 'rgb(99 102 241)',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          padding: '8px 12px',
          cursor: 'pointer',
          font: 'inherit',
        }}
      >
        {spawned ? 'Hide test extension' : 'Show test extension'}
      </button>
      {notice && (
        <div
          style={{
            background: notice.kind === 'error' ? 'rgb(180 60 60)' : 'rgb(40 44 52)',
            color: 'white',
            padding: '6px 10px',
            borderRadius: 4,
            fontSize: 12,
            maxWidth: 300,
          }}
        >
          {notice.msg}
        </div>
      )}
    </div>
  )
}
