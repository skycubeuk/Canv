import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ContextMenuItem } from '../lib/contextMenu'

interface Props {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const maxX = window.innerWidth - width - 4
    const maxY = window.innerHeight - height - 4
    setPos({
      left: Math.max(4, Math.min(x, maxX)),
      top: Math.max(4, Math.min(y, maxY)),
    })
  }, [x, y])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) onClose()
    }
    const onScroll = () => onClose()
    const onBlur = () => onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('blur-sm', onBlur)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-50 min-w-[180px] bg-elev border border-default rounded-md shadow-lg py-1 text-sm"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if ('separator' in item) {
          return <hr key={`sep-${i}`} className="my-1 border-t border-default" />
        }
        const disabled = !!item.disabled
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            aria-disabled={disabled || undefined}
            disabled={disabled}
            onClick={() => {
              if (disabled) return
              item.onClick()
              onClose()
            }}
            className={`w-full text-left px-3 py-1.5 ${
              disabled
                ? 'opacity-40 cursor-default'
                : 'hover:bg-hover'
            }`}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
