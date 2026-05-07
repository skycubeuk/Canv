import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Folder, Search, GitBranch } from 'lucide-react'
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels'
import type { SidebarTab } from '../../hooks/useIdeLayout'
import { SidebarFooter } from './sidebar/SidebarFooter'
import type { Settings } from '../../hooks/useSettings'

interface SidebarTabDef {
  id: SidebarTab
  label: string
  icon: LucideIcon
  body: ReactNode
}

interface Props {
  activeTab: SidebarTab
  onSelectTab: (tab: SidebarTab) => void
  files: ReactNode
  search?: ReactNode
  git?: ReactNode
  settings: Settings
  onUpdateSettings: (patch: Partial<Settings>) => void
  workspaceName: string | null
  outline?: ReactNode | null
  outlineSize: number
  onOutlineSizeChange: (size: number) => void
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="h-full flex items-center justify-center text-center px-6 text-sm text-muted bg-panel">
      <p>{label} arrives in a later milestone.</p>
    </div>
  )
}

export function LeftSidebar(props: Props) {
  const {
    activeTab, onSelectTab, files, search, git, settings, onUpdateSettings,
    workspaceName,
    outline, outlineSize, onOutlineSizeChange,
  } = props
  const tabs: SidebarTabDef[] = [
    { id: 'files', label: 'Files', icon: Folder, body: files },
    { id: 'search', label: 'Search', icon: Search, body: search ?? <ComingSoon label="Search" /> },
    { id: 'git', label: 'Git', icon: GitBranch, body: git ?? <ComingSoon label="Source control" /> },
  ]
  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0]
  const showOutline = activeTab === 'files' && outline != null

  const filesPaneSize = Math.max(20, Math.min(80, 100 - outlineSize))
  const outlinePaneSize = 100 - filesPaneSize

  return (
    <aside
      role="complementary"
      aria-label="Sidebar"
      className="h-full flex flex-col bg-panel border-r border-default"
    >
      <header className="shrink-0 flex border-b border-default text-xs">
        {tabs.map((t) => {
          const isActive = t.id === active.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTab(t.id)}
              className={`flex-1 px-2 py-2 flex items-center justify-center gap-1.5 border-b-2 ${
                isActive
                  ? 'border-border-strong text-default bg-active'
                  : 'border-transparent text-muted hover:bg-hover'
              }`}
            >
              <t.icon aria-hidden className="w-4 h-4" />
              <span className="font-medium">{t.label}</span>
            </button>
          )
        })}
      </header>
      <div className="flex-1 min-h-0">
        {showOutline ? (
          <Group
            orientation="vertical"
            className="h-full w-full"
            defaultLayout={{ sidebarFiles: filesPaneSize, sidebarOutline: outlinePaneSize }}
            onLayoutChanged={(layout: Layout) => {
              if (layout['sidebarOutline'] !== undefined) {
                onOutlineSizeChange(layout['sidebarOutline'])
              }
            }}
          >
            <Panel id="sidebarFiles" minSize="20%" className="min-h-0">
              {active.body}
            </Panel>
            <Separator className="h-px bg-[color:var(--border-default)] hover:bg-border-strong transition-colors cursor-row-resize" />
            <Panel id="sidebarOutline" minSize="15%" maxSize="80%" className="min-h-0">
              {outline}
            </Panel>
          </Group>
        ) : (
          active.body
        )}
      </div>
      <SidebarFooter
        settings={settings}
        onUpdateSettings={onUpdateSettings}
        workspaceName={workspaceName}
      />
    </aside>
  )
}
