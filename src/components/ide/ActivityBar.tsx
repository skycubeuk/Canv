import type React from 'react'
import { type LucideIcon } from 'lucide-react'
import type { PanelRecord } from '../../types/extension-contributions'

export interface BuiltinTab {
  id: string
  label: string
  icon: LucideIcon
}

interface Props {
  builtinTabs: readonly BuiltinTab[]
  extensionPanels: PanelRecord[]
  activeTabId: string
  onSelect: (tabId: string) => void
  sidebarVisible: boolean
}

export function ActivityBar({ builtinTabs, extensionPanels, activeTabId, onSelect, sidebarVisible }: Props) {
  const leftSidebarPanels = extensionPanels.filter((p) => p.location === 'left-sidebar')

  const renderBtn = (id: string, label: string, icon: React.ReactNode) => {
    const isActive = id === activeTabId && sidebarVisible
    return (
      <button
        key={id}
        type="button"
        aria-current={isActive ? 'page' : undefined}
        aria-label={label}
        title={label}
        onClick={() => onSelect(id)}
        className={`w-10 h-10 rounded-md grid place-items-center transition-colors ${isActive ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-hover hover:text-default'}`}
      >{icon}</button>
    )
  }

  return (
    <div
      role="navigation"
      aria-label="Activity bar"
      className="bg-panel border-r border-default w-12 py-2 px-1 flex flex-col gap-0.5"
    >
      {builtinTabs.map((t) => {
        const Icon = t.icon
        return renderBtn(t.id, t.label, <Icon size={16} strokeWidth={1.75} />)
      })}
      {leftSidebarPanels.length > 0 && (
        <div aria-hidden className="border-t border-default mx-2 my-1" />
      )}
      {leftSidebarPanels.map((p) => renderBtn(
        `ext:${p.extensionId}:${p.id}`,
        p.title,
        <canv-icon name={p.icon} size={16} />,
      ))}
    </div>
  )
}

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'canv-icon': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        name?: string
        size?: number | string
      }
    }
  }
}
