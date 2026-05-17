import { IdeShell, type DockSlot } from './IdeShell'
import type { ActiveEditorUpdateInfo } from '../../lib/cm/markdownEditor'
import { LeftSidebar } from './LeftSidebar'
import { EditorArea } from './EditorArea'
import { BottomPanel, type BottomPanelTabDef } from './BottomPanel'
import { StatusBar } from './StatusBar'
import { DockPlacementMenu } from './DockPlacementMenu'
import { FilesTab } from './sidebar/FilesTab'
import { SearchTab } from './sidebar/SearchTab'
import { HistoryTab } from './sidebar/HistoryTab'
import { getCanvHistory } from '../../lib/history'
import { SitesTab } from './sidebar/SitesTab'
import { ExtensionsTab } from '../extensions/ExtensionsTab'
import { TrustWorkspaceBanner } from '../extensions/TrustWorkspaceBanner'
import { OutlinePanel } from './sidebar/OutlinePanel'
import { Canvas } from '../Canvas'
import { SettingsTab } from './tabs/SettingsTab'
import { DiffTab } from './tabs/DiffTab'
import type { Mode } from '../../config/types'
import type { UseIdeLayoutApi, BottomLayout } from '../../hooks/useIdeLayout'
import type { WorkspaceApi } from '../../hooks/useWorkspace'
import type { Settings } from '../../hooks/useSettings'
import type { OutlineNode } from '../../lib/outline'
import type { SearchMatch } from '../../lib/searchTypes'
import type { Jumper } from '../Canvas'
import type { EditorGroupId } from '../../types/workspace'
import { EditorView } from '@codemirror/view'
import { isElectron } from '../../lib/fs'

function dockSlotForPlacement(bottom: BottomLayout): DockSlot {
  if (!bottom.visible) return 'none'
  if (bottom.placement === 'popout') return 'none'
  return bottom.placement // 'bottom' | 'right'
}

export interface WorkspaceShellProps {
  // Layout
  ideLayout: UseIdeLayoutApi
  // Workspace
  workspace: WorkspaceApi
  openRels: Set<string>
  pinnedRels: Set<string>
  // Editor registry callbacks
  onEditorReady: (groupId: EditorGroupId, rel: string, view: EditorView) => void
  onEditorDestroy: (groupId: EditorGroupId, rel: string) => void
  onJumperReady: (groupId: EditorGroupId, rel: string, jumper: Jumper) => void
  onJumperDestroy: (groupId: EditorGroupId, rel: string) => void
  onEditorChange: (groupId: EditorGroupId, rel: string, markdown: string) => void
  onEditorSelectionChange: () => void
  onActiveEditorUpdate?: (info: ActiveEditorUpdateInfo) => void
  readLiveBuffer: (groupId: EditorGroupId, rel: string) => string | undefined
  onJumpToMatch: (match: SearchMatch, q: { query: string; regex: boolean; caseSensitive: boolean }, ordinalInFile: number) => Promise<void>
  // Outline
  outlineNodes: OutlineNode[]
  focusedKey: string | null
  onOutlineJump: (node: OutlineNode) => void
  // Files / breadcrumbs
  onClickBreadcrumbFolder: (folderRel: string) => void
  revealFolderRel: string | null
  onCreateFile: (parentRel: string) => Promise<void>
  onCreateFolder: (parentRel: string) => Promise<void>
  onRename: (oldRel: string, newRel: string) => Promise<void>
  onDelete: (rel: string) => Promise<void>
  onChangeWorkspace: () => Promise<void>
  // Diff
  onOpenDiff: (rel: string, baseRef?: string, baseLabel?: string) => void
  // Revision Archaeology
  raEnabled: boolean
  onOpenRestore: (r: { snapshotId: string; relPath: string }) => void
  /** Triggers when the Files-tab context menu fires "View history" on a file. */
  onViewHistory?: (rel: string) => void
  // Settings
  settings: Settings
  onUpdateSettings: (patch: Partial<Settings>) => void
  // Settings tab callbacks
  onExportBackup: () => void
  // Bottom panel
  bottomPanelTabs: BottomPanelTabDef[]
  // Status bar
  saveState: 'saved' | 'saving' | 'conflict'
  activeProfile: Mode
  onClickProfile: () => void
  apiKeyMissing: boolean
  onClickApiKeyWarning: () => void
  cursorLine: number | null
  cursorCol: number | null
  onOpenSettings: () => void
  onToggleChat: () => void
  meterTokens: number | null
  meterCostUsd: number | null
  wordCount: number
  selectionWordCount: number | null
}

export function WorkspaceShell(props: WorkspaceShellProps) {
  const {
    ideLayout, workspace, openRels, pinnedRels,
    onEditorReady, onEditorDestroy, onJumperReady, onJumperDestroy,
    onEditorChange, onEditorSelectionChange, onActiveEditorUpdate,
    readLiveBuffer,
    onJumpToMatch,
    outlineNodes, focusedKey, onOutlineJump,
    onClickBreadcrumbFolder, revealFolderRel,
    onCreateFile, onCreateFolder, onRename, onDelete, onChangeWorkspace,
    onOpenDiff,
    raEnabled, onOpenRestore, onViewHistory,
    settings, onUpdateSettings,
    onExportBackup,
    bottomPanelTabs,
    saveState, activeProfile,
    onClickProfile, apiKeyMissing, onClickApiKeyWarning,
    cursorLine, cursorCol,
    onOpenSettings, onToggleChat,
    meterTokens, meterCostUsd,
    wordCount, selectionWordCount,
  } = props

  function setChatDraft(prompt: string) {
    window.dispatchEvent(new CustomEvent('canv:setChatDraft', { detail: prompt }))
  }

  const outlineNode = outlineNodes.length > 0 ? (
    <OutlinePanel
      nodes={outlineNodes}
      resetKey={focusedKey}
      onJump={onOutlineJump}
      collapsed={ideLayout.layout.outline.collapsed}
      onToggleSectionCollapsed={ideLayout.toggleOutlineCollapsed}
    />
  ) : null

  return (
    <div className="flex-1 min-h-0">
      <IdeShell
        sidebar={(
          <LeftSidebar
            activeTab={ideLayout.layout.sidebar.activeTab}
            onSelectTab={ideLayout.setSidebarTab}
            search={<SearchTab onJumpToMatch={onJumpToMatch} />}
            historyEnabled={raEnabled}
            history={raEnabled ? (
              <HistoryTab
                history={getCanvHistory()!}
                onOpenDiff={(r) => {
                  // r.baseSha (current) or r.commitSha (snapshot / fileHistory) — both are valid git OIDs on canv-history.
                  const sha = r.kind === 'current' ? r.baseSha : r.commitSha
                  onOpenDiff(r.relPath, sha, r.baseLabel)
                }}
                onCreateCheckpoint={async (summary) => {
                  const h = getCanvHistory(); if (!h) return
                  const changes = await h.getCurrentChanges()
                  await h.createSnapshot({
                    reason: 'manual',
                    summary,
                    files: changes.map((c) => c.relPath),
                    metadata: {},
                  })
                }}
                onRestore={onOpenRestore}
              />
            ) : undefined}
            sites={<SitesTab onRegenerate={setChatDraft} />}
            extensions={<ExtensionsTab />}
            settings={settings}
            onUpdateSettings={onUpdateSettings}
            workspaceName={workspace.root}
            files={(
              <FilesTab
                root={workspace.root}
                tree={workspace.tree}
                truncated={workspace.treeTruncated}
                openRels={openRels}
                activeRel={workspace.activeMarkdownRel}
                pinnedRels={pinnedRels}
                onOpen={(rel) => workspace.openTab(rel)}
                onPin={(rel) => workspace.pin(rel)}
                onUnpin={(rel) => workspace.unpin(rel)}
                onCreateFile={onCreateFile}
                onCreateFolder={onCreateFolder}
                onRename={onRename}
                onDelete={onDelete}
                onChangeWorkspace={onChangeWorkspace}
                revealRel={revealFolderRel}
                revisionArchaeologyEnabled={raEnabled}
                onViewHistory={onViewHistory}
              />
            )}
            outline={outlineNode}
            outlineSize={ideLayout.layout.outline.size}
            onOutlineSizeChange={ideLayout.setOutlineSize}
            onNewFile={() => onCreateFile('')}
            onNewFolder={() => onCreateFolder('')}
            onChangeWorkspace={onChangeWorkspace}
          />
        )}
        sidebarVisible={ideLayout.layout.sidebar.visible}
        sidebarSize={ideLayout.layout.sidebar.size}
        editor={(
          <main className="h-full flex flex-col min-w-0 overflow-hidden bg-app">
            <TrustWorkspaceBanner
              onReviewInSidebar={() => {
                ideLayout.setSidebarTab('extensions')
                if (!ideLayout.layout.sidebar.visible) ideLayout.toggleSidebar()
              }}
            />
            <div className="flex-1 min-h-0">
              <EditorArea
                workspaceRoot={workspace.root}
                groups={workspace.editorGroups}
                activeGroupId={workspace.activeGroupId}
                dirtySet={workspace.dirtySet}
                onSelectTab={(groupId, key) => workspace.setActiveTabByKey(key, groupId)}
                onCloseTab={(groupId, key) => workspace.closeTabByKey(key, groupId)}
                onFocusGroup={(groupId) => workspace.setActiveGroupId(groupId)}
                onMoveTab={(fromGroupId, key, toGroupId) => workspace.moveTab(key, fromGroupId, toGroupId)}
                groupSizes={ideLayout.layout.editor.sizes}
                onGroupSizesChange={(sizes) => ideLayout.setEditorSizes(sizes)}
                onClickFolder={onClickBreadcrumbFolder}
                renderTabContent={(groupId, t, isActive, viewMode) => {
                  if (t.kind === 'settings') {
                    return (
                      <SettingsTab
                        settings={settings}
                        onUpdate={onUpdateSettings}
                        onExportBackup={onExportBackup}
                      />
                    )
                  }
                  if (t.kind === 'diff') {
                    return <DiffTab relPath={t.relPath} baseRef={t.baseRef} baseLabel={t.baseLabel} isActive={isActive} />
                  }
                  return (
                    <Canvas
                      groupId={groupId}
                      tab={t}
                      isActive={isActive}
                      fontSize={settings.fontSize}
                      lineWidth={settings.lineWidth}
                      viewMode={viewMode}
                      onChange={onEditorChange}
                      onSelectionChange={onEditorSelectionChange}
                      onEditorReady={onEditorReady}
                      onEditorDestroy={onEditorDestroy}
                      onJumperReady={onJumperReady}
                      onJumperDestroy={onJumperDestroy}
                      getInitialBuffer={readLiveBuffer}
                      onActiveEditorUpdate={onActiveEditorUpdate}
                    />
                  )
                }}
                emptyState={(
                  <EmptyState
                    hasWorkspace={!!workspace.root}
                    onChooseWorkspace={onChangeWorkspace}
                  />
                )}
              />
            </div>
          </main>
        )}
        dock={(
          <BottomPanel
            tabs={bottomPanelTabs}
            activeTab={ideLayout.layout.bottom.activeTab}
            onSelectTab={ideLayout.setBottomTab}
            onClose={ideLayout.toggleBottom}
            headerRight={(
              <DockPlacementMenu
                placement={ideLayout.layout.bottom.placement}
                canPopOut={isElectron()}
                placements={['popout']}
                onChange={(next) => ideLayout.setDockPlacement(next)}
              />
            )}
          />
        )}
        dockSlot={dockSlotForPlacement(ideLayout.layout.bottom)}
        bottomSize={ideLayout.layout.bottom.size}
        rightSize={ideLayout.layout.bottom.rightSize}
        onSidebarSizeChange={ideLayout.setSidebarSize}
        onBottomSizeChange={ideLayout.setBottomSize}
        onRightSizeChange={ideLayout.setRightSize}
        statusBar={(
          <StatusBar
            saveState={saveState}
            profile={activeProfile}
            workspaceName={workspace.root}
            kind={workspace.kind}
            wordCount={wordCount}
            selectionWordCount={selectionWordCount}
            onClickProfile={onClickProfile}
            apiKeyMissing={apiKeyMissing}
            onClickApiKeyWarning={onClickApiKeyWarning}
            cursorLine={cursorLine}
            cursorCol={cursorCol}
            branch={null}
            diffStats={null}
            onOpenSettings={onOpenSettings}
            chatVisible={ideLayout.layout.bottom.visible && ideLayout.layout.bottom.activeTab === 'chat'}
            onToggleChat={onToggleChat}
            meterTokens={meterTokens}
            meterCostUsd={meterCostUsd}
          />
        )}
      />
    </div>
  )
}

function EmptyState({ hasWorkspace, onChooseWorkspace }: { hasWorkspace: boolean; onChooseWorkspace: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center text-center px-6">
      <div className="max-w-md space-y-3 text-muted">
        {hasWorkspace ? (
          <>
            <p className="text-base font-medium text-default">No file open</p>
            <p className="text-sm">
              Pick a file from the sidebar, or use the New file button to create one. Pin files in the tree to feed
              them to the AI as background context.
            </p>
          </>
        ) : (
          <>
            <p className="text-base font-medium text-default">Welcome to Canv 0.2</p>
            <p className="text-sm">Choose a folder on your computer to use as your writing workspace.</p>
            <button type="button" className="btn-primary" onClick={onChooseWorkspace}>
              Choose folder
            </button>
          </>
        )}
      </div>
    </div>
  )
}
