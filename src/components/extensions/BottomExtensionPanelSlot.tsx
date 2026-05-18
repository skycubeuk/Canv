import { useEffect, useRef } from 'react'

interface Props {
  slotId: string  // 'ext:<extensionId>:<panelId>'
}

export function BottomExtensionPanelSlot({ slotId }: Props) {
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

  return <div ref={ref} style={{ flex: 1, width: '100%', height: '100%' }} />
}
