import { useEffect, useRef } from 'react'

interface Props {
  extensionId: string
  relPath: string
  mode: 'viewer' | 'editor'
  /** EditorGroup keeps all tabs mounted (toggling visibility). When inactive,
   *  collapse the WebContentsView to zero bounds so it doesn't float over the
   *  active tab's content. */
  isActive: boolean
}

export function ExtensionEditorTab({ extensionId, relPath, mode, isActive }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf: number | null = null
    const send = () => {
      raf = null
      if (!isActive) {
        void window.canvExtensions?.hideFileInExtension?.(extensionId, relPath)
        return
      }
      const r = el.getBoundingClientRect()
      const bounds = { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
      void window.canvExtensions?.showFileInExtension?.(extensionId, relPath, mode, bounds)
    }
    const schedule = () => { if (raf == null) raf = requestAnimationFrame(send) }
    schedule()
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    window.addEventListener('resize', schedule)
    return () => {
      if (raf != null) cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', schedule)
      void window.canvExtensions?.hideFileInExtension?.(extensionId, relPath)
    }
  }, [extensionId, relPath, mode, isActive])
  return (
    <div
      ref={ref}
      data-testid={`extension-editor-tab-${extensionId}`}
      data-relpath={relPath}
      style={{ flex: 1, width: '100%', height: '100%' }}
    />
  )
}
