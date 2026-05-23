import { useEffect, useState, useCallback } from 'react'
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
    <div role="alert" className="bg-warning-soft border-b border-warning px-4 py-2 flex items-center gap-3 text-[13px] shrink-0">
      <span className="flex-1">
        This workspace contains {count} extension{count === 1 ? '' : 's'}. They will not run until you trust this workspace.
      </span>
      <button type="button" onClick={onReviewInSidebar} className="btn-secondary btn-sm">Review in Sidebar</button>
      <button type="button" onClick={() => void window.canvExtensions?.setWorkspaceTrust('always-disabled')} className="btn-secondary btn-sm">Always disable</button>
      <button type="button" onClick={() => void window.canvExtensions?.setWorkspaceTrust('trusted')} className="btn-primary btn-sm">Trust this workspace</button>
    </div>
  )
}
