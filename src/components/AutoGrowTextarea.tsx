import { forwardRef, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react'

export interface AutoGrowTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Controlled value. Required — the component resizes whenever this changes. */
  value: string
  /** Minimum visible rows. Default 2. */
  minRows?: number
  /** Maximum visible rows before internal scrolling kicks in. Default 6. */
  maxRows?: number
}

export const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, AutoGrowTextareaProps>(
  function AutoGrowTextarea({ value, minRows = 2, maxRows = 6, rows, style, ...rest }, forwardedRef) {
    const innerRef = useRef<HTMLTextAreaElement | null>(null)

    const setRef = (el: HTMLTextAreaElement | null) => {
      innerRef.current = el
      if (typeof forwardedRef === 'function') forwardedRef(el)
      else if (forwardedRef) forwardedRef.current = el
    }

    useLayoutEffect(() => {
      const el = innerRef.current
      if (!el) return
      const cs = window.getComputedStyle(el)
      const lineHeight = parseFloat(cs.lineHeight) || 20
      const paddingY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
      const minHeight = minRows * lineHeight + paddingY
      const maxHeight = maxRows * lineHeight + paddingY

      // Collapse so scrollHeight reflects content height, not the previous height.
      el.style.height = 'auto'
      const target = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight)
      el.style.height = `${target}px`
      el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
    }, [value, minRows, maxRows])

    return (
      <textarea
        ref={setRef}
        value={value}
        rows={rows ?? minRows}
        style={style}
        {...rest}
      />
    )
  }
)
