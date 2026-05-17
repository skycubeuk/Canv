import { useEffect, useState, useCallback } from 'react'
import type React from 'react'
// Window.canvExtensions is declared in ExtensionsTab.tsx — no re-declaration needed.

interface Props {
  onReviewInSidebar: () => void
}

export function TrustWorkspaceBanner({ onReviewInSidebar }: Props) {
  const [show, setShow] = useState(false)
  const [count, setCount] = useState(0)

  const check = useCallback(async () => {
    const dev = window.canvExtensions
    if (!dev) { setShow(false); return }
    const [list, trust] = await Promise.all([dev.listInstalled(), dev.getWorkspaceTrust()])
    setCount(list.length)
    setShow(list.length > 0 && trust === 'untrusted')
  }, [])

  useEffect(() => {
    let cancelled = false
    const dev = window.canvExtensions
    if (dev) {
      void (async () => {
        const [list, trust] = await Promise.all([dev.listInstalled(), dev.getWorkspaceTrust()])
        if (cancelled) return
        setCount(list.length)
        setShow(list.length > 0 && trust === 'untrusted')
      })()
    }
    const off = dev?.onChanged(() => { void check() })
    return () => { cancelled = true; off?.() }
  }, [check])

  if (!show) return null

  return (
    <div role="alert" style={{
      background: 'rgb(180 100 0 / 25%)',
      borderBottom: '1px solid rgb(180 100 0 / 40%)',
      padding: '8px 16px',
      display: 'flex', alignItems: 'center', gap: 12, fontSize: 13,
      flexShrink: 0,
    }}>
      <span style={{ flex: 1 }}>
        This workspace contains {count} extension{count === 1 ? '' : 's'}. They will not run until you trust this workspace.
      </span>
      <button type="button" onClick={onReviewInSidebar} style={secondaryBtn}>Review in Sidebar</button>
      <button type="button" onClick={() => void window.canvExtensions?.setWorkspaceTrust('always-disabled')} style={secondaryBtn}>Always disable</button>
      <button type="button" onClick={() => void window.canvExtensions?.setWorkspaceTrust('trusted')} style={primaryBtn}>Trust this workspace</button>
    </div>
  )
}

const primaryBtn: React.CSSProperties = {
  background: 'rgb(99 102 241)', color: 'white', border: 'none',
  borderRadius: 4, padding: '4px 10px', cursor: 'pointer', font: 'inherit', fontSize: 12,
}
const secondaryBtn: React.CSSProperties = {
  background: 'var(--color-elev)', color: 'var(--text-color-default)',
  border: '1px solid var(--border-color-default)', borderRadius: 4, padding: '4px 10px',
  cursor: 'pointer', font: 'inherit', fontSize: 12,
}
