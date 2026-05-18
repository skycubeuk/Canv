import { useEffect, useRef } from 'react'

interface Props {
  sessionId: string
  hasManifest: boolean
  onBoundsChanged: (bounds: { x: number; y: number; width: number; height: number }) => void
}

export function BuilderPreviewSlot({ sessionId: _sessionId, hasManifest, onBoundsChanged }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const report = () => {
      const r = el.getBoundingClientRect()
      onBoundsChanged({ x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) })
    }
    // Initial bounds
    report()
    const ro = new ResizeObserver(() => report())
    ro.observe(el)
    window.addEventListener('resize', report)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', report)
    }
  }, [onBoundsChanged])

  return (
    <div ref={ref} style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-app, #0a0b0d)',
      color: 'var(--text-color-subtle)',
      fontSize: 12,
    }}>
      {!hasManifest && 'Preview will appear here once the AI generates the extension.'}
    </div>
  )
}
