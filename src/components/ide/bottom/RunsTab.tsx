import { X, CircleHelp } from 'lucide-react'
import { RunView, type RunRecord } from '../../ResultsPanel'
import { useModes, getModeById, getActionById } from '../../../hooks/useModes'
import { timeAgo } from '../../../lib/timeAgo'
import { cost } from '../../../lib/cost'
import type { ModelPricing } from '../../../config/pricing'
import type { Provider } from '../../../adapters'

interface Props {
  runs: RunRecord[]
  activeId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onApply: (run: RunRecord, text: string) => void
  onRerun: (run: RunRecord) => void
  onRefine: (run: RunRecord, message: string) => void
  pricingOverrides: Record<string, ModelPricing>
  /** Optional override for tests; production uses PRICING. */
  pricingDefaults?: Record<string, ModelPricing>
}

export function RunsTab(props: Props) {
  const { runs, activeId, onSelect, onClose, onApply, onRerun, onRefine, pricingOverrides, pricingDefaults } = props
  const { modes, defaultModeId } = useModes()

  if (runs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted px-6 text-center">
        Trigger an agent from the floating toolbar or document toolbar to see results here.
      </div>
    )
  }

  const active = runs.find((r) => r.id === activeId) ?? runs[0]

  return (
    <div className="h-full flex min-h-0">
      <div className="w-56 shrink-0 border-r border-default overflow-y-auto py-1">
        {runs.map((r) => {
          const isActive = r.id === active.id
          const mode = getModeById(modes, r.modeId) ?? getModeById(modes, defaultModeId)!
          const action = getActionById(mode, r.agentId)
          const Icon = action?.icon ?? CircleHelp
          return (
            <div
              key={r.id}
              className={`group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-xs ${
                isActive
                  ? 'bg-active text-default'
                  : 'text-muted hover:bg-hover'
              }`}
              onClick={() => onSelect(r.id)}
            >
              <Icon aria-hidden className="w-4 h-4" />
              <span className="font-medium truncate">{r.agentLabel}</span>
              {r.tokenUsage && (() => {
                const c = cost(r.tokenUsage, r.provider as Provider, r.model, pricingOverrides, pricingDefaults)
                return c == null ? null : (
                  <span className="text-subtle font-mono text-[10px] ml-1">
                    ${c.toFixed(3)}
                  </span>
                )
              })()}
              <span className="text-subtle ml-auto whitespace-nowrap">{timeAgo(r.timestamp)}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClose(r.id) }}
                className="opacity-0 group-hover:opacity-60 hover:opacity-100! ml-1"
                aria-label={`Close ${r.agentLabel}`}
              >
                <X aria-hidden className="w-3 h-3" />
              </button>
            </div>
          )
        })}
      </div>
      <div className="flex-1 min-w-0 overflow-hidden">
        <RunView run={active} onApply={onApply} onRerun={onRerun} onRefine={onRefine} />
      </div>
    </div>
  )
}
