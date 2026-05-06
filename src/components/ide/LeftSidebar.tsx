import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Folder, Search, GitBranch } from 'lucide-react'
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
  chatOpen: boolean
  onToggleChat: () => void
  onOpenSettings: () => void
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="h-full flex items-center justify-center text-center px-6 text-sm text-stone-500 dark:text-neutral-400 bg-stone-100 dark:bg-neutral-900">
      <p>{label} arrives in a later milestone.</p>
    </div>
  )
}

export function LeftSidebar(props: Props) {
  const { activeTab, onSelectTab, files, search, git, settings, onUpdateSettings, chatOpen, onToggleChat, onOpenSettings } = props
  const tabs: SidebarTabDef[] = [
    { id: 'files', label: 'Files', icon: Folder, body: files },
    { id: 'search', label: 'Search', icon: Search, body: search ?? <ComingSoon label="Search" /> },
    { id: 'git', label: 'Git', icon: GitBranch, body: git ?? <ComingSoon label="Source control" /> },
  ]
  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0]

  return (
    <aside
      role="complementary"
      aria-label="Sidebar"
      className="h-full flex flex-col bg-stone-100 dark:bg-neutral-900 border-r border-stone-200 dark:border-neutral-800"
    >
      <header className="shrink-0 flex border-b border-stone-200 dark:border-neutral-800 text-xs">
        {tabs.map((t) => {
          const isActive = t.id === active.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTab(t.id)}
              className={`flex-1 px-2 py-2 flex items-center justify-center gap-1.5 border-b-2 ${
                isActive
                  ? 'border-stone-700 dark:border-neutral-200 text-stone-900 dark:text-neutral-100 bg-white dark:bg-neutral-950'
                  : 'border-transparent text-stone-600 dark:text-neutral-400 hover:bg-stone-200/60 dark:hover:bg-neutral-800/60'
              }`}
            >
              <t.icon aria-hidden className="w-4 h-4" />
              <span className="font-medium">{t.label}</span>
            </button>
          )
        })}
      </header>
      <div className="flex-1 min-h-0">{active.body}</div>
      <SidebarFooter
        settings={settings}
        onUpdateSettings={onUpdateSettings}
        chatOpen={chatOpen}
        onToggleChat={onToggleChat}
        onOpenSettings={onOpenSettings}
      />
    </aside>
  )
}
