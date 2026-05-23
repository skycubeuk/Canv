import { createContext, useContext, useRef, useState, type ReactNode } from 'react'
import type { z } from 'zod'

/** Config for the per-row extras slot. `useRowState` is called exactly ONCE
 *  per row (inside a small Provider component) and its return value is shared
 *  with both renderers through a per-row React context — no duplicate hook
 *  calls, no duplicate IPC, no duplicate DOM. */
export interface RowExtrasConfig<T> {
  useRowState: (
    item: T,
    idx: number,
    helpers: { onCollapsed: (cb: () => void) => () => void },
  ) => unknown
  /** Rendered inside the row header strip, regardless of expand state. */
  header: (state: unknown, helpers: { isExpanded: boolean }) => ReactNode
  /** Rendered inside the expanded form panel, only when `isExpanded`. */
  panel: (state: unknown) => ReactNode
}

interface Props<T> {
  value: T[]
  onChange: (v: T[]) => void
  label: string
  help?: string
  itemLabel?: (item: T) => string
  /** Stable per-item identity used as the React key for each row. When the
   *  array is reordered, rows with stable keys carry their component state
   *  (including per-row hooks via `renderRowExtras`) with them. Default:
   *  fall back to the row index — fine for arrays without per-row state,
   *  but reorders will visually keep state at the old position. Provide
   *  when rows have meaningful state to preserve across reorders/removals. */
  keyOf?: (item: T, idx: number) => string | number
  /** Item schema — passed to the parent renderer. */
  itemSchema: z.ZodTypeAny
  /** Renderer the parent passes in to avoid an import cycle. */
  renderItemForm: (schema: z.ZodTypeAny, item: T, onItemChange: (next: T) => void) => ReactNode
  /** Factory for a fresh item; the parent supplies this so it can pick a
   *  discriminator variant if the item schema is a discriminated union. */
  createItem: () => T
  /** Bespoke per-row content rendered in TWO positions: a header slot (always
   *  visible alongside the row's action buttons) and a panel slot (visible
   *  only when the row is expanded, rendered below the form fields). Per-row
   *  state (e.g. an async status hook) is lifted by `useRowState` — called
   *  ONCE per row — and threaded into both renderers via a per-row React
   *  context. */
  renderRowExtras?: RowExtrasConfig<T>
}

// Per-row context. The value is intentionally `unknown` because each consumer
// owns the shape returned by its `useRowState`; the consumer casts inside its
// renderers.
const RowExtrasContext = createContext<unknown>(null)

/** Wraps a single row and calls its `useRowState` hook exactly once. The
 *  returned state is exposed through `RowExtrasContext` to both the header
 *  and panel consumers. */
function RowExtrasProvider<T>({
  item,
  idx,
  onCollapsed,
  useRowState,
  children,
}: {
  item: T
  idx: number
  onCollapsed: (cb: () => void) => () => void
  useRowState: RowExtrasConfig<T>['useRowState']
  children: ReactNode
}) {
  const state = useRowState(item, idx, { onCollapsed })
  return <RowExtrasContext.Provider value={state}>{children}</RowExtrasContext.Provider>
}

function HeaderConsumer({
  render,
  isExpanded,
}: {
  render: RowExtrasConfig<unknown>['header']
  isExpanded: boolean
}) {
  const state = useContext(RowExtrasContext)
  return <>{render(state, { isExpanded })}</>
}

function PanelConsumer({ render }: { render: RowExtrasConfig<unknown>['panel'] }) {
  const state = useContext(RowExtrasContext)
  return <>{render(state)}</>
}

export function ArrayOfObjectsControl<T>({
  value,
  onChange,
  label,
  help,
  itemLabel,
  keyOf,
  itemSchema,
  renderItemForm,
  createItem,
  renderRowExtras,
}: Props<T>) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  // Per-row collapse listeners. Fired when the row transitions expanded → collapsed
  // (via header click OR via `remove`). Each row indexes a Set of subscribers so
  // multiple consumers per row are safe.
  const collapseListenersRef = useRef<Map<number, Set<() => void>>>(new Map())

  const subscribeCollapse = (idx: number, cb: () => void): (() => void) => {
    const map = collapseListenersRef.current
    if (!map.has(idx)) map.set(idx, new Set())
    map.get(idx)!.add(cb)
    return () => { map.get(idx)?.delete(cb) }
  }

  const fireCollapse = (idx: number) => {
    const set = collapseListenersRef.current.get(idx)
    if (!set) return
    for (const cb of set) {
      try { cb() } catch (e) { console.error('[ArrayOfObjectsControl] collapse listener threw', e) }
    }
  }

  function update(idx: number, next: T) {
    const out = value.slice()
    out[idx] = next
    onChange(out)
  }

  function remove(idx: number) {
    if (expandedIdx === idx) fireCollapse(idx)
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

  // The row body — extracted so we can conditionally wrap it in a
  // RowExtrasProvider when a `renderRowExtras` config is supplied. The
  // header / panel slots inside read from RowExtrasContext, so wrapping the
  // whole `<li>` lets both slots see the same state from a single hook call.
  const renderRow = (item: T, idx: number) => {
    const expanded = expandedIdx === idx
    const rowKey = keyOf ? keyOf(item, idx) : idx
    const body = (
      <li key={rowKey} className="rounded border border-default">
        <div className="flex items-center justify-between px-2 py-1 gap-2">
          <button
            type="button"
            onClick={() => {
              if (expanded) {
                // Transitioning expanded → collapsed; fire listeners BEFORE the
                // state update so a synchronous listener still sees the row as
                // expanded if it needs to.
                fireCollapse(idx)
                setExpandedIdx(null)
              } else {
                setExpandedIdx(idx)
              }
            }}
            className="flex-1 text-left text-xs truncate hover:text-default"
          >
            {itemLabel ? itemLabel(item) : `Item ${idx + 1}`}
          </button>
          <div className="flex items-center gap-1 shrink-0">
            {renderRowExtras && (
              <HeaderConsumer render={renderRowExtras.header} isExpanded={expanded} />
            )}
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
              className="px-1 text-xs text-danger hover:text-danger-fg"
              aria-label="Remove"
            >
              ×
            </button>
          </div>
        </div>
        {expanded && (
          <div className="border-t border-default p-2 flex flex-col gap-2">
            {renderItemForm(itemSchema, item, (next) => update(idx, next))}
            {renderRowExtras && <PanelConsumer render={renderRowExtras.panel} />}
          </div>
        )}
      </li>
    )
    if (!renderRowExtras) return body
    return (
      <RowExtrasProvider
        key={rowKey}
        item={item}
        idx={idx}
        onCollapsed={(cb) => subscribeCollapse(idx, cb)}
        useRowState={renderRowExtras.useRowState}
      >
        {body}
      </RowExtrasProvider>
    )
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
          {value.map((item, idx) => renderRow(item, idx))}
        </ul>
      )}
    </section>
  )
}
