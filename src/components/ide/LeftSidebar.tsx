import type { ReactNode } from 'react'

import { Plus, FolderPlus, FolderOpen } from 'lucide-react'
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels'
import type { SidebarTab } from '../../hooks/useIdeLayout'
import { SidebarFooter } from './sidebar/SidebarFooter'
import type { Settings } from '../../hooks/useSettings'

interface SidebarTabDef {
  id: SidebarTab
  label: string
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
  onNewFile: () => void
  onNewFolder: () => void
  onChangeWorkspace: () => void
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
    activeTab, files, search, git, settings, onUpdateSettings,
    workspaceName,
    outline, outlineSize, onOutlineSizeChange,
    onNewFile, onNewFolder, onChangeWorkspace,
  } = props
  const tabs: SidebarTabDef[] = [
    { id: 'files', label: 'Files', body: files },
    { id: 'search', label: 'Search', body: search ?? <ComingSoon label="Search" /> },
    { id: 'git', label: 'Git', body: git ?? <ComingSoon label="Source control" /> },
  ]
  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0]
  const showFiles = activeTab === 'files'
  const showOutline = showFiles && outline != null

  const filesPaneSize = Math.max(20, Math.min(80, 100 - outlineSize))
  const outlinePaneSize = 100 - filesPaneSize

  return (
    <aside
      role="complementary"
      aria-label="Sidebar"
      className="h-full flex flex-col bg-panel border-r border-default"
    >

      {activeTab === 'files' && (
        <header className="shrink-0 flex items-center justify-between px-3 pt-2.5 pb-2">
          <span className="text-[10.5px] font-semibold tracking-wider uppercase text-subtle">
            Workspace
          </span>
          <div className="flex gap-0.5">
            <button
              type="button"
              aria-label="New file"
              className="w-[22px] h-[22px] grid place-items-center rounded text-subtle hover:bg-hover hover:text-default"
              onClick={onNewFile}
            >
              <Plus aria-hidden className="w-3 h-3" />
            </button>
            <button
              type="button"
              aria-label="New folder"
              className="w-[22px] h-[22px] grid place-items-center rounded text-subtle hover:bg-hover hover:text-default"
              onClick={onNewFolder}
            >
              <FolderPlus aria-hidden className="w-3 h-3" />
            </button>
            <button
              type="button"
              aria-label="Change workspace"
              title="Change workspace"
              className="w-[22px] h-[22px] grid place-items-center rounded text-subtle hover:bg-hover hover:text-default"
              onClick={onChangeWorkspace}
            >
              <FolderOpen aria-hidden className="w-3 h-3" />
            </button>
          </div>
        </header>
      )}
      <div className="flex-1 min-h-0">
        {showFiles ? (
          // Always render the Group on the Files tab so the FilesTab Panel
          // keeps the same React identity whether or not the outline is
          // present. Swapping between `{active.body}` and `<Group>...` would
          // remount FileTree and wipe its expanded-folder state.
          <Group
            orientation="vertical"
            className="h-full w-full"
            defaultLayout={showOutline
              ? { sidebarFiles: filesPaneSize, sidebarOutline: outlinePaneSize }
              : { sidebarFiles: 100 }}
            onLayoutChanged={(layout: Layout) => {
              if (layout['sidebarOutline'] !== undefined) {
                onOutlineSizeChange(layout['sidebarOutline'])
              }
            }}
          >
            <Panel id="sidebarFiles" minSize="20%" className="min-h-0">
              {active.body}
            </Panel>
            {showOutline && (
              <Separator className="h-px bg-[rgb(var(--border-default))] hover:bg-[rgb(var(--border-strong))] transition-colors cursor-row-resize" />
            )}
            {showOutline && (
              <Panel id="sidebarOutline" minSize="15%" maxSize="80%" className="min-h-0">
                {outline}
              </Panel>
            )}
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
