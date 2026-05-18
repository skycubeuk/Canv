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
        style={{
          width: 32, height: 32,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isActive ? 'var(--color-accent)' : 'transparent',
          color: isActive ? 'var(--color-accent-fg)' : 'var(--text-color-muted)',
          border: 'none', borderRadius: 4,
          margin: '4px auto', cursor: 'pointer',
        }}
      >{icon}</button>
    )
  }

  return (
    <div
      role="navigation"
      aria-label="Activity bar"
      style={{
        width: 44, height: '100%',
        background: 'var(--color-panel)',
        borderRight: '1px solid var(--border-color-default)',
        display: 'flex', flexDirection: 'column', alignItems: 'stretch',
      }}
    >
      {builtinTabs.map((t) => {
        const Icon = t.icon
        return renderBtn(t.id, t.label, <Icon size={16} strokeWidth={1.75} />)
      })}
      {leftSidebarPanels.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border-color-default)', margin: '4px 8px' }} aria-hidden="true" />
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
