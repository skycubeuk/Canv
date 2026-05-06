import { X, CircleHelp } from 'lucide-react'
import { RunView, type RunRecord } from '../../ResultsPanel'
import { useModes, getModeById, getActionById } from '../../../hooks/useModes'
import { timeAgo } from '../../../lib/timeAgo'

interface Props {
  runs: RunRecord[]
  activeId: string | null
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onApply: (run: RunRecord, text: string) => void
  onRerun: (run: RunRecord) => void
  onRefine: (run: RunRecord, message: string) => void
}

export function RunsTab(props: Props) {
  const { runs, activeId, onSelect, onClose, onApply, onRerun, onRefine } = props
  const { modes, defaultModeId } = useModes()

  if (runs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-stone-500 dark:text-neutral-400 px-6 text-center">
        Trigger an agent from the floating toolbar or document toolbar to see results here.
      </div>
    )
  }

  const active = runs.find((r) => r.id === activeId) ?? runs[0]

  return (
    <div className="h-full flex min-h-0">
      <div className="w-56 shrink-0 border-r border-stone-200 dark:border-neutral-800 overflow-y-auto py-1">
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
                  ? 'bg-stone-100 dark:bg-neutral-800 text-stone-900 dark:text-neutral-100'
                  : 'text-stone-600 dark:text-neutral-400 hover:bg-stone-100/60 dark:hover:bg-neutral-800/60'
              }`}
              onClick={() => onSelect(r.id)}
            >
              <Icon aria-hidden className="w-4 h-4" />
              <span className="font-medium truncate">{r.agentLabel}</span>
              <span className="text-stone-400 ml-auto whitespace-nowrap">{timeAgo(r.timestamp)}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClose(r.id) }}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 ml-1"
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
