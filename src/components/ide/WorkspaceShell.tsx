import { useCallback, useMemo, useRef, useState } from 'react'
import { IdeShell, type DockSlot } from './IdeShell'
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
import { InstallExtensionMenu } from '../extensions/InstallExtensionMenu'
import type { ExtensionsTabHandle } from '../extensions/ExtensionsTab'
import { TrustWorkspaceBanner } from '../extensions/TrustWorkspaceBanner'
import { BottomExtensionPanelSlot } from '../extensions/BottomExtensionPanelSlot'
import { OutlinePanel } from './sidebar/OutlinePanel'
import { Canvas } from '../Canvas'
import { SuggestionBar } from './SuggestionBar'
import { AnnotationBar } from './AnnotationBar'
import { SettingsTab } from './tabs/SettingsTab'
import { DiffTab } from './tabs/DiffTab'
import { ActivityBar, type BuiltinTab } from './ActivityBar'
import { Folder, Search, History as HistoryIcon, LayoutDashboard, Puzzle, Plus, FolderPlus, FolderOpen } from 'lucide-react'
import { SidebarIconButton } from './sidebar/SidebarChrome'
import type { SidebarPanelDef } from './LeftSidebar'
import type { HistoryTabHandle } from './sidebar/HistoryTab'
import { useContributions } from '../../hooks/useContributions'
import { useFileHandlerRouting } from '../../hooks/useFileHandlerRouting'
import { editorMapKey } from '../../hooks/useEditorRegistry'
import { ExtensionEditorTab } from '../extensions/ExtensionEditorTab'
import type { BottomLayout } from '../../hooks/useIdeLayout'
import type { OutlineNode } from '../../lib/outline'
import { EditorView } from '@codemirror/view'
import { isElectron } from '../../lib/fs'
import { exportBackup } from '../../lib/backup'
import { useService } from '../../services/useService'

function dockSlotForPlacement(bottom: BottomLayout): DockSlot {
  if (!bottom.visible) return 'none'
  if (bottom.placement === 'popout') return 'none'
  return bottom.placement // 'bottom' | 'right'
}

export interface WorkspaceShellProps {
  /** Opens the restore-preview dialog; target is App-local UI state. */
  onOpenRestore: (r: { snapshotId: string; relPath: string }) => void
  /** Triggers when the Files-tab context menu fires "View history" on a file. */
  onViewHistory?: (rel: string) => void
  // Bottom panel — App-local (composed via useBottomPanelTabs in App.tsx)
  bottomPanelTabs: BottomPanelTabDef[]
}

export function WorkspaceShell(props: WorkspaceShellProps) {
  const {
    onOpenRestore, onViewHistory,
    bottomPanelTabs,
  } = props

  // Service-backed values — replaces the prop chain from App.tsx.
  const workspace = useService('workspace')
  const editorRegistry = useService('editorRegistry')
  const ideLayout = useService('ideLayout')
  const settingsApi = useService('settings')
  const fileOps = useService('workspaceFileOps')
  const setup = useService('setup')
  const modesSvc = useService('modes')
  const selectionAgent = useService('selectionAgent')
  const suggestions = useService('suggestions')
  const activeProfileId = modesSvc.profile ?? modesSvc.defaultModeId
  const activeProfile =
    modesSvc.modes.find((m) => m.id === activeProfileId) ??
    modesSvc.modes.find((m) => m.id === modesSvc.defaultModeId)!
  const { settings } = settingsApi
  const onUpdateSettings = settingsApi.update
  const raEnabled = setup.config?.revisionArchaeology.enabled === true
  const onExportBackup = useCallback(() => {
    workspace.flushAll()
    exportBackup()
  }, [workspace])

  const contributions = useContributions()
  const fileHandlerRouting = useFileHandlerRouting()

  // Derived sets — previously computed in App.tsx and passed in.
  const openRels = useMemo(() => {
    const out = new Set<string>()
    for (const g of workspace.editorGroups) {
      for (const t of g.openTabs) {
        if (t.kind === 'markdown') out.add(t.relPath)
      }
    }
    return out
  }, [workspace.editorGroups])
  const pinnedRels = useMemo(
    () => new Set(workspace.pinned.map((p) => p.relPath)),
    [workspace.pinned],
  )

  // FileTree reveal target — drives a one-shot expand on the FileTree. Stays
  // local to WorkspaceShell since no other AppInner state reads it.
  const [revealFolderRel, setRevealFolderRel] = useState<string | null>(null)

  // Folder the sidebar's +file / +folder buttons target. Set by clicking or
  // right-clicking a folder row in the tree; '' means workspace root.
  const [selectedDir, setSelectedDir] = useState('')
  const [seenRoot, setSeenRoot] = useState(workspace.root)
  if (workspace.root !== seenRoot) {
    setSeenRoot(workspace.root)
    setSelectedDir('')
  }
  const onClickBreadcrumbFolder = useCallback((folderRel: string) => {
    ideLayout.setSidebarTab('files')
    if (!ideLayout.layout.sidebar.visible) ideLayout.toggleSidebar()
    setRevealFolderRel(folderRel)
    setSelectedDir(folderRel)
    // Clear in a microtask so consecutive clicks on the same folder still
    // bump the prop and re-trigger the FileTree expand effect.
    setTimeout(() => setRevealFolderRel(null), 0)
  }, [ideLayout])

  // Outline jump — uses editor + jumper refs from the registry service.
  const { editorsRef, jumpersRef } = editorRegistry
  const onOutlineJump = useCallback((node: OutlineNode) => {
    const rel = workspace.activeMarkdownRel
    if (!rel) return
    const key = editorMapKey(workspace.activeGroupId, rel)
    const jumper = jumpersRef.current.get(key)
    if (jumper) {
      jumper(node.line, node.index)
      return
    }
    const view = editorsRef.current.get(key)
    if (!view) return
    const doc = view.state.doc
    const safeLine = Math.max(1, Math.min(node.line, doc.lines))
    const linePos = doc.line(safeLine).from
    view.dispatch({
      selection: { anchor: linePos },
      effects: EditorView.scrollIntoView(linePos, { y: 'start', yMargin: 8 }),
    })
    view.focus()
  }, [workspace.activeGroupId, workspace.activeMarkdownRel, editorsRef, jumpersRef])

  // Diff open — wraps workspace.openDiffTab for HistoryTab + breadcrumb hooks.
  const onOpenDiff = useCallback(
    (rel: string, baseRef: string = 'HEAD', baseLabel?: string) => {
      workspace.openDiffTab(rel, baseRef, baseLabel)
    },
    [workspace],
  )

  /**
   * Open a file, routing through extension file handlers when a match exists.
   * Pass opts.withExtensionId to force a specific handler, or null to force CodeMirror.
   */
  function openFile(rel: string, opts?: { withExtensionId?: string | null }) {
    if (opts?.withExtensionId !== undefined) {
      if (opts.withExtensionId === null) {
        // Force text editor
        void workspace.openTab(rel)
        return
      }
      const handler = fileHandlerRouting.list(rel).find((h) => h.extensionId === opts.withExtensionId)
      workspace.openExtensionTab(rel, opts.withExtensionId, handler?.mode ?? 'viewer')
      return
    }
    // Auto-route
    const handler = fileHandlerRouting.resolve(rel)
    if (handler) {
      workspace.openExtensionTab(rel, handler.extensionId, handler.mode)
      return
    }
    void workspace.openTab(rel)
  }

  const builtinTabs: BuiltinTab[] = [
    { id: 'files', label: 'Files', icon: Folder },
    { id: 'search', label: 'Search', icon: Search },
    ...(raEnabled ? [{ id: 'history', label: 'History', icon: HistoryIcon }] : []),
    { id: 'sites', label: 'Sites', icon: LayoutDashboard },
    { id: 'extensions', label: 'Extensions', icon: Puzzle },
  ]

  function onSelectSidebarTab(tabId: string) {
    const { visible, activeTab } = ideLayout.layout.sidebar
    if (visible && activeTab === tabId) {
      ideLayout.toggleSidebar()
      return
    }
    ideLayout.setSidebarTab(tabId)
    if (!visible) ideLayout.toggleSidebar()
  }

  function setChatDraft(prompt: string) {
    window.dispatchEvent(new CustomEvent('canv:setChatDraft', { detail: prompt }))
  }

  const outlineNode = editorRegistry.outlineNodes.length > 0 ? (
    <OutlinePanel
      nodes={editorRegistry.outlineNodes}
      resetKey={editorRegistry.focusedKey}
      onJump={onOutlineJump}
      collapsed={ideLayout.layout.outline.collapsed}
      onToggleSectionCollapsed={ideLayout.toggleOutlineCollapsed}
    />
  ) : null

  const historyRef = useRef<HistoryTabHandle | null>(null)
  const extensionsRef = useRef<ExtensionsTabHandle | null>(null)

  const panels: SidebarPanelDef[] = [
    {
      id: 'files',
      title: 'Workspace',
      headerActions: (
        <>
          <SidebarIconButton
            aria-label="New file"
            icon={Plus}
            onClick={() => fileOps.createFile(selectedDir)}
          />
          <SidebarIconButton
            aria-label="New folder"
            icon={FolderPlus}
            onClick={() => fileOps.createFolder(selectedDir)}
          />
          <SidebarIconButton
            aria-label="Change workspace"
            title="Change workspace"
            icon={FolderOpen}
            onClick={fileOps.changeWorkspace}
          />
        </>
      ),
      body: (
        <FilesTab
          root={workspace.root}
          tree={workspace.tree}
          truncated={workspace.treeTruncated}
          openRels={openRels}
          activeRel={workspace.activeMarkdownRel}
          pinnedRels={pinnedRels}
          onOpen={(rel) => openFile(rel)}
          onOpenWith={(rel, extensionId) => openFile(rel, { withExtensionId: extensionId })}
          onPin={(rel) => workspace.pin(rel)}
          onUnpin={(rel) => workspace.unpin(rel)}
          onCreateFile={fileOps.createFile}
          onCreateFolder={fileOps.createFolder}
          onRename={fileOps.rename}
          onDelete={fileOps.remove}
          onChangeWorkspace={fileOps.changeWorkspace}
          selectedDir={selectedDir}
          onSelectDir={setSelectedDir}
          revealRel={revealFolderRel}
          revisionArchaeologyEnabled={raEnabled}
          onViewHistory={onViewHistory}
        />
      ),
    },
    {
      id: 'search',
      title: 'Search',
      body: <SearchTab onJumpToMatch={editorRegistry.jumpToMatch} />,
    },
    ...(raEnabled
      ? [{
          id: 'history' as const,
          title: 'History',
          headerActions: (
            <SidebarIconButton
              aria-label="Create checkpoint"
              title="Create checkpoint"
              icon={Plus}
              onClick={() => historyRef.current?.openCheckpointComposer()}
            />
          ),
          body: (
            <HistoryTab
              ref={historyRef}
              history={getCanvHistory()!}
              onOpenDiff={(r) => {
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
          ),
        }]
      : []),
    {
      id: 'sites',
      title: 'Sites',
      body: <SitesTab onRegenerate={setChatDraft} />,
    },
    {
      id: 'extensions',
      title: 'Extensions',
      headerActions: (
        <InstallExtensionMenu
          onFromFolder={() => extensionsRef.current?.installFromFolder()}
          onFromFile={() => extensionsRef.current?.installFromFile()}
        />
      ),
      body: <ExtensionsTab ref={extensionsRef} />,
    },
  ]

  const extensionBottomTabs: BottomPanelTabDef[] = contributions.panels
    .filter((p) => p.location === 'bottom-dock')
    .map((p) => ({
      id: `ext:${p.extensionId}:${p.id}`,
      label: p.title,
      icon: Puzzle,
      render: () => <BottomExtensionPanelSlot slotId={`ext:${p.extensionId}:${p.id}`} />,
    }))

  const allBottomTabs = [...bottomPanelTabs, ...extensionBottomTabs]

  return (
    <div style={{ display: 'flex', height: '100%' }} className="flex-1 min-h-0">
      <ActivityBar
        builtinTabs={builtinTabs}
        extensionPanels={contributions.panels}
        activeTabId={ideLayout.layout.sidebar.activeTab}
        onSelect={onSelectSidebarTab}
        sidebarVisible={ideLayout.layout.sidebar.visible}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <IdeShell
        sidebar={(
          <LeftSidebar
            activeTab={ideLayout.layout.sidebar.activeTab}
            panels={panels}
            settings={settings}
            onUpdateSettings={onUpdateSettings}
            workspaceName={workspace.root}
            outline={outlineNode}
            outlineSize={ideLayout.layout.outline.size}
            onOutlineSizeChange={ideLayout.setOutlineSize}
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
                profile={activeProfile}
                onRunDocAgent={(groupId, agent, instruction) =>
                  selectionAgent.handleAgentOnDocument(groupId, agent, instruction)
                }
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
                  if (t.kind === 'extension') {
                    return (
                      <ExtensionEditorTab
                        extensionId={t.extensionId}
                        relPath={t.relPath}
                        mode={t.mode}
                        isActive={isActive}
                      />
                    )
                  }
                  return (
                    <>
                      <Canvas
                        groupId={groupId}
                        tab={t}
                        isActive={isActive}
                        fontSize={settings.fontSize}
                        lineWidth={settings.lineWidth}
                        viewMode={viewMode}
                        onChange={editorRegistry.handleEditorChange}
                        onEditorReady={editorRegistry.handleEditorReady}
                        onEditorDestroy={editorRegistry.handleEditorDestroy}
                        onJumperReady={editorRegistry.handleJumperReady}
                        onJumperDestroy={editorRegistry.handleJumperDestroy}
                        getInitialBuffer={editorRegistry.readLiveBuffer}
                        onActiveEditorUpdate={editorRegistry.onActiveEditorUpdate}
                        suggestionCallbacks={suggestions.callbacks}
                      />
                      {isActive && groupId === workspace.activeGroupId && (
                        <SuggestionBar
                          count={suggestions.pendingCount}
                          onAcceptAll={() => suggestions.acceptAll()}
                          onRejectAll={() => suggestions.rejectAll()}
                        />
                      )}
                      {isActive && groupId === workspace.activeGroupId && (
                        <AnnotationBar
                          count={suggestions.annotationCount}
                          allCollapsed={suggestions.allAnnotationsCollapsed}
                          onToggleCollapseAll={(collapsed) => suggestions.collapseAllAnnotations(collapsed)}
                        />
                      )}
                    </>
                  )
                }}
                emptyState={(
                  <EmptyState
                    hasWorkspace={!!workspace.root}
                    onChooseWorkspace={fileOps.changeWorkspace}
                  />
                )}
              />
            </div>
          </main>
        )}
        dock={(
          <BottomPanel
            tabs={allBottomTabs}
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
        statusBar={<StatusBar />}
      />
      </div>
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
            <p className="text-base font-medium text-default">Welcome to Canv {__APP_VERSION__}</p>
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
