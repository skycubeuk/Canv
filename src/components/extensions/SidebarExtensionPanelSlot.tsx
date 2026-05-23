import { useEffect, useRef } from 'react'

interface Props {
  slotId: string  // 'ext:<extensionId>:<panelId>'
}

export function SidebarExtensionPanelSlot({ slotId }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf: number | null = null
    const send = () => {
      raf = null
      const r = el.getBoundingClientRect()
      const bounds = { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
      void window.canvExtensions?.showPanelInSlot?.(slotId, bounds)
    }
    // Coalesce reports to next frame so layout (react-resizable-panels, sidebar
    // remount) has settled before we set the WebContentsView's bounds; otherwise
    // the view briefly snaps to a stale wider rect before ResizeObserver
    // corrects it.
    const schedule = () => {
      if (raf != null) return
      raf = requestAnimationFrame(send)
    }
    schedule()
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    window.addEventListener('resize', schedule)
    return () => {
      if (raf != null) cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', schedule)
      void window.canvExtensions?.hidePanelInSlot?.(slotId)
    }
  }, [slotId])

  return (
    <div
      ref={ref}
      data-testid={`sidebar-extension-slot-${slotId}`}
      style={{ flex: 1, width: '100%', height: '100%' }}
    />
  )
}
