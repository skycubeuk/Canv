import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { X } from 'lucide-react'
import type { BottomTab } from '../../hooks/useIdeLayout'

export interface BottomPanelTabDef {
  id: BottomTab
  label: string
  icon: LucideIcon
  badge?: string | number
  render: () => ReactNode
}

interface Props {
  tabs: BottomPanelTabDef[]
  activeTab: BottomTab
  onSelectTab: (tab: BottomTab) => void
  onClose?: () => void
  headerRight?: ReactNode
}

export function BottomPanel({ tabs, activeTab, onSelectTab, onClose, headerRight }: Props) {
  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0]

  return (
    <section
      role="region"
      aria-label="Bottom panel"
      className="h-full flex flex-col bg-white dark:bg-neutral-900 border-t border-stone-200 dark:border-neutral-800 min-h-0"
    >
      <header className="shrink-0 flex items-center border-b border-stone-200 dark:border-neutral-800 text-xs">
        {tabs.map((t) => {
          const isActive = t.id === active.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTab(t.id)}
              className={`px-3 py-1.5 flex items-center gap-1.5 border-b-2 ${
                isActive
                  ? 'border-stone-700 dark:border-neutral-200 text-stone-900 dark:text-neutral-100 bg-white dark:bg-neutral-900'
                  : 'border-transparent text-stone-600 dark:text-neutral-400 hover:bg-stone-100/60 dark:hover:bg-neutral-800/60'
              }`}
            >
              <t.icon aria-hidden className="w-4 h-4" />
              <span className="font-medium">{t.label}</span>
              {t.badge != null && (
                <span className="text-stone-400 ml-0.5">({t.badge})</span>
              )}
            </button>
          )
        })}
        <div className="ml-auto flex items-center">
          {headerRight}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-stone-500 hover:text-stone-900 dark:hover:text-neutral-100"
              title="Hide bottom panel (Ctrl+`)"
              aria-label="Hide bottom panel"
            >
              <X aria-hidden className="w-3 h-3" />
            </button>
          )}
        </div>
      </header>
      <div className="flex-1 min-h-0 overflow-hidden">{active.render()}</div>
    </section>
  )
}
