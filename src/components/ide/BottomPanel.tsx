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
      <header className="shrink-0 flex items-center h-9 px-1.5 border-b border-default text-[11.5px]">
        {tabs.map((t) => {
          const isActive = t.id === active.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTab(t.id)}
              className={`relative flex items-center gap-1.5 px-2.5 h-7 mt-1 rounded font-medium ${
                isActive ? 'text-default' : 'text-muted hover:bg-hover'
              }`}
            >
              <t.icon aria-hidden className="w-3 h-3" />
              <span>{t.label}</span>
              {t.badge != null && (
                <span className="text-[10px] px-1.5 rounded bg-active text-muted leading-[14px]">
                  {t.badge}
                </span>
              )}
              {isActive && (
                <span
                  aria-hidden
                  className="absolute -bottom-[5px] left-2 right-2 h-0.5 bg-accent rounded-sm"
                />
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
              className="w-7 h-7 grid place-items-center text-subtle hover:bg-hover hover:text-default rounded"
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
