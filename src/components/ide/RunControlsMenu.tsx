import { useEffect, useRef } from 'react'
import type { Provider, StreamChunkDelayMs } from '../../hooks/useSettings'

const DELAY_OPTIONS: StreamChunkDelayMs[] = [0, 50, 100, 200]

/**
 * Popover anchored to the Run-button chevron in TopBar. Surfaces the
 * model picker, slow-mode delay selector, auto-scroll toggle and a
 * compact token/cost meter for the active session.
 *
 * v0.7.0: the Run button's main click action is to focus the chat
 * composer (Canv has no canonical "Run" target). The chevron opens
 * this menu. Future versions can wire the main click to a real
 * action.
 */
interface Props {
  open: boolean
  onClose: () => void
  provider: Provider
  model: string
  availableModels: string[]
  onChangeModel: (model: string) => void
  streamChunkDelayMs: StreamChunkDelayMs
  onChangeDelay: (delay: StreamChunkDelayMs) => void
  followLatest: boolean
  onToggleFollow: () => void
  meterTotalTokens: number
  meterCostUsd: number
}

export function RunControlsMenu(props: Props) {
  const {
    open, onClose, model, availableModels, onChangeModel,
    streamChunkDelayMs, onChangeDelay, followLatest, onToggleFollow,
    meterTotalTokens, meterCostUsd,
  } = props
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (e: MouseEvent) => {
      const root = ref.current
      if (!root) return
      if (e.target instanceof Node && root.contains(e.target)) return
      onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Run controls"
      className="absolute top-full right-0 mt-1 w-[280px] bg-elev border border-default rounded-lg shadow-lg p-3 space-y-3 z-40"
    >
      <div>
        <label htmlFor="run-controls-model" className="block text-xs uppercase tracking-wider text-subtle mb-1">
          Model
        </label>
        <select
          id="run-controls-model"
          className="input"
          value={model}
          onChange={(e) => onChangeModel(e.target.value)}
        >
          {availableModels.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs uppercase tracking-wider text-subtle">Slow mode</span>
          <span className="text-[10px] text-subtle">stream chunk delay</span>
        </div>
        <div className="inline-flex p-0.5 bg-app border border-default rounded-md">
          {DELAY_OPTIONS.map((d) => {
            const selected = d === streamChunkDelayMs
            return (
              <button
                key={d}
                type="button"
                onClick={() => onChangeDelay(d)}
                className={`px-2 py-0.5 text-xs rounded ${
                  selected ? 'bg-elev text-default shadow' : 'text-muted hover:text-default'
                }`}
              >
                {d}ms
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-default">Auto-scroll</span>
        <button
          type="button"
          role="switch"
          aria-checked={followLatest}
          aria-label="Auto-scroll to latest message"
          onClick={onToggleFollow}
          className={`w-9 h-5 rounded-full p-0.5 transition-colors ${
            followLatest ? 'bg-accent' : 'bg-hover'
          }`}
        >
          <span
            className={`block w-4 h-4 rounded-full bg-elev transition-transform ${
              followLatest ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      <div className="pt-2 border-t border-default flex items-center justify-between text-xs">
        <span className="text-muted">{meterTotalTokens.toLocaleString()} tok</span>
        <span className="text-muted">${meterCostUsd.toFixed(2)}</span>
      </div>
    </div>
  )
}
