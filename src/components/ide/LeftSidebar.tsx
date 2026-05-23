import type { ReactNode } from 'react'

import { Group, Panel, Separator, type Layout } from 'react-resizable-panels'
import type { SidebarTab } from '../../hooks/useIdeLayout'
import { SidebarFooter } from './sidebar/SidebarFooter'
import { SidebarHeader } from './sidebar/SidebarChrome'
import type { Settings } from '../../hooks/useSettings'
import { SidebarExtensionPanelSlot } from '../extensions/SidebarExtensionPanelSlot'

export interface SidebarPanelDef {
  id: SidebarTab
  title: string
  headerActions?: ReactNode
  body: ReactNode
  footer?: ReactNode
}

interface Props {
  activeTab: SidebarTab
  panels: SidebarPanelDef[]
  settings: Settings
  onUpdateSettings: (patch: Partial<Settings>) => void
  workspaceName: string | null
  outline?: ReactNode | null
  outlineSize: number
  onOutlineSizeChange: (size: number) => void
}

export function LeftSidebar(props: Props) {
  const {
    activeTab, panels, settings, onUpdateSettings, workspaceName,
    outline, outlineSize, onOutlineSizeChange,
  } = props

  const isExtensionPanel = activeTab.startsWith('ext:')
  const active = panels.find((p) => p.id === activeTab) ?? panels[0]
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
      {!isExtensionPanel && active && (
        <SidebarHeader title={active.title} actions={active.headerActions} />
      )}
      <div className="flex-1 min-h-0">
        {isExtensionPanel ? (
          <SidebarExtensionPanelSlot slotId={activeTab} />
        ) : showFiles ? (
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
              {active?.body}
            </Panel>
            {showOutline && (
              <Separator className="h-px bg-border-default hover:bg-border-strong transition-colors cursor-row-resize" />
            )}
            {showOutline && (
              <Panel id="sidebarOutline" minSize="15%" maxSize="80%" className="min-h-0">
                {outline}
              </Panel>
            )}
          </Group>
        ) : (
          active?.body
        )}
      </div>
      {!isExtensionPanel && active?.footer}
      <SidebarFooter
        settings={settings}
        onUpdateSettings={onUpdateSettings}
        workspaceName={workspaceName}
      />
    </aside>
  )
}
