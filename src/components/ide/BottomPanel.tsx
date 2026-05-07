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
      className="h-full flex flex-col bg-panel border-t border-default min-h-0"
    >
      <header className="shrink-0 flex items-center border-b border-default text-xs">
        {tabs.map((t) => {
          const isActive = t.id === active.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTab(t.id)}
              className={`px-3 py-1.5 flex items-center gap-1.5 border-b-2 ${
                isActive
                  ? 'border-strong text-default bg-panel'
                  : 'border-transparent text-muted hover:bg-hover'
              }`}
            >
              <t.icon aria-hidden className="w-4 h-4" />
              <span className="font-medium">{t.label}</span>
              {t.badge != null && (
                <span className="text-subtle ml-0.5">({t.badge})</span>
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
              className="px-3 py-1.5 text-muted hover:text-default"
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
