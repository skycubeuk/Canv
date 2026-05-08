import { useCallback, useState, type ReactNode } from 'react'
import { EditorTabs } from '../EditorTabs'
import { SubToolbar } from './SubToolbar'
import { tabKey, isMarkdownTab, isDiffTab } from '../../lib/tabKey'
import type { OpenTab, EditorGroupId } from '../../types/workspace'

type ViewMode = 'edit' | 'preview'

interface Props {
  groupId: EditorGroupId
  isActive: boolean
  workspaceRoot: string | null
  tabs: OpenTab[]
  activeKey: string | null
  dirtySet: Set<string>
  onSelect: (key: string) => void
  onClose: (key: string) => void
  onClickFolder?: (folderRel: string) => void
  onFocusGroup: () => void
  onDropTab: (sourceGroupId: EditorGroupId, key: string) => void
  renderTabContent: (
    tab: OpenTab,
    isActive: boolean,
    viewMode: ViewMode,
  ) => ReactNode
  emptyState: ReactNode
}

export function EditorGroup(props: Props) {
  const {
    groupId, isActive, workspaceRoot, tabs, activeKey, dirtySet,
    onSelect, onClose, onClickFolder, onFocusGroup, onDropTab,
    renderTabContent, emptyState,
  } = props

  const activeTab = tabs.find((t) => tabKey(t) === activeKey) ?? null
  const breadcrumbRel = activeTab && isMarkdownTab(activeTab) ? activeTab.relPath : null
  const breadcrumbDiff = activeTab && isDiffTab(activeTab) ? activeTab : null
  const hasMarkdownTab = activeTab !== null && isMarkdownTab(activeTab)

  const [viewModes, setViewModes] = useState<Map<string, ViewMode>>(() => new Map())

  const setTabViewMode = useCallback((key: string, mode: ViewMode) => {
    setViewModes((prev) => {
      const next = new Map(prev)
      next.set(key, mode)
      return next
    })
  }, [])

  const activeTabViewMode: ViewMode | null = hasMarkdownTab && activeKey
    ? (viewModes.get(activeKey) ?? 'edit')
    : null

  const handleChangeActiveTabViewMode = useCallback((mode: ViewMode) => {
    if (!activeKey) return
    setTabViewMode(activeKey, mode)
  }, [activeKey, setTabViewMode])

  const subToolbarRelPath = breadcrumbDiff
    ? breadcrumbDiff.relPath
    : breadcrumbRel

  return (
    <div
      className={`h-full flex flex-col min-w-0 bg-app ${
        isActive ? '' : 'opacity-95'
      }`}
      onMouseDown={() => { if (!isActive) onFocusGroup() }}
    >
      <EditorTabs
        groupId={groupId}
        tabs={tabs}
        activeKey={activeKey}
        dirtySet={dirtySet}
        onSelect={(key) => { if (!isActive) onFocusGroup(); onSelect(key) }}
        onClose={onClose}
        onDropTab={onDropTab}
      />
      <SubToolbar
        workspaceName={workspaceRoot}
        relPath={subToolbarRelPath}
        onClickFolder={onClickFolder ?? (() => {})}
        viewMode={activeTabViewMode}
        onChangeViewMode={handleChangeActiveTabViewMode}
        showViewToggle={hasMarkdownTab}
      />
      <div className="flex-1 min-h-0 relative">
        {tabs.length === 0 ? (
          emptyState
        ) : (
          tabs.map((t) => {
            const key = tabKey(t)
            const tabMode: ViewMode = viewModes.get(key) ?? 'edit'
            return (
              <div
                key={key}
                className="absolute inset-0"
                style={{ visibility: key === activeKey ? 'visible' : 'hidden' }}
              >
                {renderTabContent(t, key === activeKey, tabMode)}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
