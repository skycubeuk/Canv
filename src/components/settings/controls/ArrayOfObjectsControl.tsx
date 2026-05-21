import { useState, type ReactNode } from 'react'
import type { z } from 'zod'

interface Props<T> {
  value: T[]
  onChange: (v: T[]) => void
  label: string
  help?: string
  itemLabel?: (item: T) => string
  /** Item schema — passed to the parent renderer. */
  itemSchema: z.ZodTypeAny
  /** Renderer the parent passes in to avoid an import cycle. */
  renderItemForm: (schema: z.ZodTypeAny, item: T, onItemChange: (next: T) => void) => ReactNode
  /** Factory for a fresh item; the parent supplies this so it can pick a
   *  discriminator variant if the item schema is a discriminated union. */
  createItem: () => T
}

export function ArrayOfObjectsControl<T>({
  value,
  onChange,
  label,
  help,
  itemLabel,
  itemSchema,
  renderItemForm,
  createItem,
}: Props<T>) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  function update(idx: number, next: T) {
    const out = value.slice()
    out[idx] = next
    onChange(out)
  }

  function remove(idx: number) {
    const out = value.slice()
    out.splice(idx, 1)
    onChange(out)
    if (expandedIdx === idx) setExpandedIdx(null)
    else if (expandedIdx !== null && expandedIdx > idx) setExpandedIdx(expandedIdx - 1)
  }

  function move(idx: number, dir: -1 | 1) {
    const target = idx + dir
    if (target < 0 || target >= value.length) return
    const out = value.slice()
    const [it] = out.splice(idx, 1)
    out.splice(target, 0, it)
    onChange(out)
    if (expandedIdx === idx) setExpandedIdx(target)
  }

  function add() {
    const nextIdx = value.length
    onChange([...value, createItem()])
    setExpandedIdx(nextIdx)
  }

  return (
    <section className="flex flex-col gap-2 text-sm">
      <header className="flex items-baseline justify-between">
        <div className="flex flex-col">
          <span className="font-medium">{label}</span>
          {help && <span className="text-xs text-muted">{help}</span>}
        </div>
        <button type="button" className="btn-secondary text-xs" onClick={add}>
          + Add
        </button>
      </header>
      {value.length === 0 ? (
        <p className="text-xs text-muted italic">None configured.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {value.map((item, idx) => {
            const expanded = expandedIdx === idx
            return (
              <li key={idx} className="rounded border border-default">
                <div className="flex items-center justify-between px-2 py-1 gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedIdx(expanded ? null : idx)}
                    className="flex-1 text-left text-xs truncate hover:text-default"
                  >
                    {itemLabel ? itemLabel(item) : `Item ${idx + 1}`}
                  </button>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      className="px-1 text-xs disabled:opacity-30"
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => move(idx, +1)}
                      disabled={idx === value.length - 1}
                      className="px-1 text-xs disabled:opacity-30"
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(idx)}
                      className="px-1 text-xs text-red-500 hover:text-red-400"
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </div>
                </div>
                {expanded && (
                  <div className="border-t border-default p-2">
                    {renderItemForm(itemSchema, item, (next) => update(idx, next))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
