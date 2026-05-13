import { useCallback, useEffect, useMemo, useState } from 'react'
import { EditorView } from '@codemirror/view'
import { FloatingToolbar } from './components/FloatingToolbar'
import { MigrationModal } from './components/MigrationModal'
import { AppOverlays } from './components/ide/AppOverlays'
import { legacyStateExists } from './lib/legacyState'
import { WorkspaceShell } from './components/ide/WorkspaceShell'
import { buildBottomPanelTabs, type BottomPanelTabsAdapter } from './components/ide/bottomPanelTabs'
import { useLintIssues } from './hooks/useLintIssues'
import { useSettings } from './hooks/useSettings'
import { useWorkspace } from './hooks/useWorkspace'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useIdeLayout } from './hooks/useIdeLayout'
import type { OutlineNode } from './lib/outline'
import { useEditorStats } from './hooks/useEditorStats'
import { useCommands } from './hooks/useCommands'
import type { PaletteMode, PaletteFile } from './components/ide/CommandPalette'
import type { Action as AgentDef } from './config/types'
import { useModes } from './hooks/useModes'
import { useProfilePicker } from './hooks/useProfilePicker'
import { isElectron, flattenTree, getFs } from './lib/fs'
import { WorkspaceSetupModal } from './components/WorkspaceSetupModal'
import { useWorkspaceSetup } from './hooks/useWorkspaceSetup'
import { getCanvHistory } from './lib/history'
import { RestorePreviewDialog } from './components/ide/sidebar/RestorePreviewDialog'
import { exportBackup } from './lib/backup'
import { useDialogs } from './lib/dialogs'
import { useNotifications } from './hooks/useNotifications'
import { useEditorRegistry, editorMapKey } from './hooks/useEditorRegistry'
import { useWorkspaceFileOps } from './hooks/useWorkspaceFileOps'
import { useSelectionAgent } from './hooks/useSelectionAgent'
import { applyAccent, applyTheme, resolveTheme } from './lib/accent'
import { buildChatSystemPreamble } from './lib/buildChatSystemPreamble'
import { TopBar } from './components/ide/TopBar'
import { useChatSessions } from './hooks/useChatSessions'
import { useAppCommands } from './hooks/useAppCommands'
import { useDockBridgeMain } from './hooks/useDockBridgeMain'
import { useIdleAutosnapshot } from './hooks/useIdleAutosnapshot'
import type { ChatProvider } from './components/ChatPanel'
import { getAdapter } from './adapters'

function basename(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i >= 0 ? rel.slice(i + 1) : rel
}

export default function App() {
  const dialogs = useDialogs()
  const notifications = useNotifications()
  const { showToast } = notifications
  const { settings, update, modelForAgent } = useSettings()

  useEffect(() => {
    applyAccent(settings.accent)
    applyTheme(resolveTheme(settings.theme))
  }, [settings.accent, settings.theme])

  useEffect(() => {
    if (settings.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [settings.theme])

  const [profile, setProfile] = useLocalStorage<string | null>('canv:profile', null)
  const { modes, defaultModeId } = useModes()
  const activeProfileId = profile ?? defaultModeId
  const activeProfile = modes.find((m) => m.id === activeProfileId) ?? modes.find((m) => m.id === defaultModeId)!
  const [migrationOpen, setMigrationOpen] = useState(() => isElectron() && legacyStateExists())

  const workspace = useWorkspace({ onToast: showToast })
  const { openSettingsTab } = workspace

  const setup = useWorkspaceSetup({
    workspaceReady: workspace.ready,
    remote: workspace.kind?.kind === 'remote',
    fs: getFs(),
    // Provide a no-op stub when canvHistory is not exposed (e.g. dock popout / web build).
    // The hook only calls history.init when enableRA + non-remote, so the stub is unreachable
    // in that path; this keeps the type happy.
    history: getCanvHistory() ?? { init: async () => ({ branch: 'canv-history', headCommit: '' }) },
    defaultModeId: defaultModeId ?? 'fiction',
  })

  const fileOps = useWorkspaceFileOps({
    workspace,
    dialogs,
    showToast: notifications.showToast,
  })

  const editorRegistry = useEditorRegistry({ workspace })
  const {
    editorsRef, jumpersRef,
    selectionTick,
    getActiveEditor, getActiveEditorForGroup,
    handleEditorReady, handleEditorDestroy,
    handleJumperReady, handleJumperDestroy,
    handleEditorChange, handleEditorSelectionChange,
    readLiveBuffer,
    openSources, outlineNodes, focusedKey,
    jumpToMatch,
  } = editorRegistry

  const ideLayout = useIdeLayout(workspace.root)

  const profilePicker = useProfilePicker({
    profile,
    setProfile,
    workspaceReady: workspace.ready,
    migrationOpen,
  })

  const commands = useCommands()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteMode, setPaletteMode] = useState<PaletteMode>('commands')
  const [recentFiles, setRecentFiles] = useState<string[]>([])
  const [revealFolderRel, setRevealFolderRel] = useState<string | null>(null)
  const [pendingDocAgent, setPendingDocAgent] = useState<AgentDef | null>(null)

  const lintIssuesApi = useLintIssues({
    openSources,
    tree: workspace.tree,
    opts: settings.lintRules,
  })

  const handleClickBreadcrumbFolder = useCallback((folderRel: string) => {
    ideLayout.setSidebarTab('files')
    if (!ideLayout.layout.sidebar.visible) ideLayout.toggleSidebar()
    setRevealFolderRel(folderRel)
    // Clear in a microtask so consecutive clicks on the same folder still
    // bump the prop and re-trigger the FileTree expand effect.
    setTimeout(() => setRevealFolderRel(null), 0)
  }, [ideLayout])

  const handleOpenDiff = useCallback((rel: string, baseRef: string = 'HEAD', baseLabel?: string) => {
    workspace.openDiffTab(rel, baseRef, baseLabel)
  }, [workspace])

  const handleOutlineJump = useCallback((node: OutlineNode) => {
    const rel = workspace.activeMarkdownRel
    if (!rel) return
    const key = editorMapKey(workspace.activeGroupId, rel)
    const jumper = jumpersRef.current.get(key)
    if (jumper) {
      jumper(node.line, node.index)
      return
    }
    // Fallback: no Canvas-registered jumper (no current code path hits this,
    // but keeps the contract well-defined). Drive CodeMirror directly.
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- editorsRef and jumpersRef are stable refs; omitting them is correct
  }, [workspace.activeGroupId, workspace.activeMarkdownRel])

  // Surface localStorage QuotaExceededError as a toast.
  useEffect(() => {
    const handler = () =>
      showToast('Storage full — export your runs/chat or trim them')
    window.addEventListener('canv:quota-error', handler)
    return () => window.removeEventListener('canv:quota-error', handler)
  }, [showToast])

  // Track recent files for the palette file-open mode.
  useEffect(() => {
    const rel = workspace.activeMarkdownRel
    if (!rel) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- functional updater; runs only when activeMarkdownRel changes, no cascade risk
    setRecentFiles((prev) => {
      if (prev[0] === rel) return prev
      const next = [rel, ...prev.filter((r) => r !== rel)]
      return next.slice(0, 30)
    })
  }, [workspace.activeMarkdownRel])

  const paletteFiles = useMemo<PaletteFile[]>(() => {
    if (!workspace.tree) return []
    const out: PaletteFile[] = []
    for (const entry of flattenTree(workspace.tree)) {
      if (entry.kind === 'file' && /\.(md|markdown)$/i.test(entry.relPath)) {
        out.push({ rel: entry.relPath, basename: entry.name })
      }
    }
    return out
  }, [workspace.tree])

  const paletteRecents = useMemo<PaletteFile[]>(() => {
    return recentFiles.map((rel) => {
      const i = rel.lastIndexOf('/')
      return { rel, basename: i >= 0 ? rel.slice(i + 1) : rel }
    })
  }, [recentFiles])

  const { showBottomTab } = ideLayout

  // Mirror the sidebar toggle: clicking the active placement collapses the
  // dock; clicking an inactive placement switches and ensures it's visible.
  const setBottomPlacementBottom = useCallback(() => {
    const { visible, placement } = ideLayout.layout.bottom
    if (visible && placement === 'bottom') {
      ideLayout.toggleBottom()
      return
    }
    ideLayout.setDockPlacement('bottom')
    if (!visible) ideLayout.toggleBottom()
  }, [ideLayout])

  const setBottomPlacementRight = useCallback(() => {
    const { visible, placement } = ideLayout.layout.bottom
    if (visible && placement === 'right') {
      ideLayout.toggleBottom()
      return
    }
    ideLayout.setDockPlacement('right')
    if (!visible) ideLayout.toggleBottom()
  }, [ideLayout])

  const raEnabled = setup.config?.revisionArchaeology.enabled === true

  useIdleAutosnapshot({
    enabled: raEnabled,
    idleMs: 10 * 60 * 1000,
    history: raEnabled ? getCanvHistory() : null,
  })

  const [restoreTarget, setRestoreTarget] = useState<{ snapshotId: string; relPath: string } | null>(null)
  const [fileHistoryTarget, setFileHistoryTarget] = useState<string | null>(null)
  const [fileHistoryNonce, setFileHistoryNonce] = useState(0)

  const openFileHistory = useCallback((rel: string) => {
    setFileHistoryTarget(rel)
    setFileHistoryNonce((n) => n + 1)
    ideLayout.showBottomTab('fileHistory')
  }, [ideLayout])

  // TODO(0.7.1): wire cursor line/col from Canvas's CodeMirror via onCursorChange prop.
  const [cursorPos] = useState<{ line: number; col: number } | null>(null)

  const selectionAgent = useSelectionAgent({
    settings,
    modelForAgent,
    activeProfile,
    activeProfileId,
    workspace,
    getActiveEditor,
    getActiveEditorForGroup,
    showToast: notifications.showToast,
    openSettingsTab,
    showBottomTab,
  })
  const {
    runs, activeTabId, setActiveTabId,
    handleAgentFromToolbar, handleAgentOnDocument,
    handleApply, handleRerun, handleCloseTab,
    refineRun,
  } = selectionAgent

  const chatSession = useChatSessions({
    settings,
    update,
    workspace,
    activeProfile,
    getActiveEditor,
    showToast: notifications.showToast,
    openSettingsTab,
    showRetryUndoToast: notifications.showRetryUndoToast,
    dismissRetryUndo: notifications.dismissRetryUndo,
    dialogs,
    historyClient: raEnabled ? getCanvHistory() : null,
  })
  const {
    chatMessages, chatBusy, pendingApprovals,
    followLatest, setFollowLatest,
    apiKeyMissing, chatProvider, chatModel, meterTotals,
    sendChat, retryFromAnchor, editAndRetry, undoRetry,
    stopChat, clearChat,
    onApprovalDecide,
    sessions, allSessions, activeId, createSession, selectSession, closeSession, setActiveSessionProviderModel,
    getSession,
  } = chatSession

  const availableModels: Record<ChatProvider, string[]> = useMemo(() => ({
    anthropic: getAdapter('anthropic').models,
    openai: getAdapter('openai').models,
  }), [])

  const handleExport = useCallback(
    (fmt: 'txt' | 'md') => {
      const view = getActiveEditor()
      if (!view || !workspace.activeMarkdownRel) return
      const text = view.state.doc.toString()
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const name = basename(workspace.activeMarkdownRel).replace(/\.(md|markdown)$/i, '')
      a.href = url
      a.download = `${name || 'document'}.${fmt}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },
    [getActiveEditor, workspace.activeMarkdownRel],
  )

  const activeEditor = editorRegistry.getActiveEditor()
  const { wordCount, selectionWordCount } = useEditorStats(activeEditor)

  useAppCommands({
    commands,
    ideLayout,
    workspace,
    activeProfile,
    dialogs,
    openSettingsTab,
    openSwitcher: profilePicker.openSwitcher,
    changeWorkspace: fileOps.changeWorkspace,
    openRemoteWorkspace: fileOps.openRemoteWorkspace,
    handleExport,
    getActiveEditor,
    handleAgentOnDocument,
    setPaletteMode,
    setPaletteOpen,
    setPendingDocAgent,
  })

  const jumpToProblem = useCallback(
    (issue: import('./lib/lintTypes').LintIssue) => {
      editorRegistry.jumpToProblem(issue, lintIssuesApi.issues)
    },
    [editorRegistry, lintIssuesApi.issues],
  )

  const chatSystemPreamble = useMemo(
    () => buildChatSystemPreamble({ activeProfile }),
    [activeProfile],
  )

  useDockBridgeMain({
    ideLayout,
    modes,
    defaultModeId,
    activeProfile,
    runs,
    activeTabId,
    setActiveTabId,
    handleRerun,
    handleCloseTab,
    handleApply,
    refineRun,
    chatMessages,
    chatProvider,
    chatModel,
    chatBusy,
    pendingApprovals,
    followLatest,
    contextFileName: workspace.activeMarkdownRel ? basename(workspace.activeMarkdownRel) : null,
    sessions,
    chatSessionsFull: allSessions,
    chatSystemPreamble,
    activeSessionId: activeId,
    availableModels,
    sendChat,
    clearChat,
    stopChat,
    retryFromAnchor,
    editAndRetry,
    onApprovalDecide,
    setFollowLatest,
    createSession,
    selectSession,
    closeSession,
    setActiveSessionProviderModel,
    problems: lintIssuesApi.issues,
    lintScanState: lintIssuesApi.scanState,
    lintScanError: lintIssuesApi.scanError,
    scanProblems: () => { void lintIssuesApi.scanWorkspace() },
    clearProblems: lintIssuesApi.clearWorkspaceIssues,
    jumpToProblem,
    settings,
    pricingOverrides: settings.pricingOverrides,
  })

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

  const saveState = workspace.conflict
    ? 'conflict' as const
    : workspace.dirtySet.size > 0
      ? 'saving' as const
      : 'saved' as const

  const applyRunWithSnapshot = useCallback(async (run: import('./components/ResultsPanel').RunRecord, replacement: string) => {
    const rel = workspace.activeMarkdownRel
    const client = raEnabled ? getCanvHistory() : null

    if (!client || !rel) {
      handleApply(run, replacement)
      return
    }

    const meta = {
      source: 'agent_apply',
      runId: run.id,
      agentId: run.agentId,
      agentLabel: run.agentLabel,
      provider: run.provider,
      model: run.model,
    }

    // Persist any pending edits so the before-snapshot reflects current on-disk state.
    try { await workspace.flushAll() } catch (e) { console.warn('[apply] flush before snapshot failed', e) }

    let beforeId: string | null = null
    try {
      const e = await client.createSnapshot({
        reason: 'before_ai_edit',
        summary: `Before apply · ${run.agentLabel}`,
        files: [rel],
        metadata: meta,
      })
      beforeId = e.id
    } catch (e) {
      console.warn('[apply] before snapshot failed', e)
      notifications.showToast(`History snapshot failed: ${(e as Error).message}`)
    }

    // Run the existing apply path — handles decideApply, dispatch, setRuns, toast.
    handleApply(run, replacement)

    // The dispatch is in-memory. Force-save and wait so the file lands on disk before the after-snapshot.
    const view = getActiveEditor()
    if (view && rel) {
      workspace.saveTab(rel, view.state.doc.toString())
      try { await workspace.flushAll() } catch (e) { console.warn('[apply] flush after dispatch failed', e) }
    }

    if (beforeId) {
      try {
        await client.createSnapshot({
          reason: 'after_ai_edit',
          summary: `After apply · ${run.agentLabel}`,
          files: [rel],
          metadata: meta,
        })
        await client.patchSnapshotFiles(beforeId, [rel])
      } catch (e) {
        console.warn('[apply] after snapshot failed', e)
        notifications.showToast(`History snapshot failed: ${(e as Error).message}`)
      }
    }
  }, [workspace, raEnabled, handleApply, getActiveEditor, notifications])

  const bottomPanelAdapter = useMemo<BottomPanelTabsAdapter>(() => ({
    runs,
    activeRunId: activeTabId,
    selectRun: setActiveTabId,
    closeRun: handleCloseTab,
    applyRun: applyRunWithSnapshot,
    rerunRun: handleRerun,
    refineRun,
    chatMessages,
    chatBusy,
    chatProvider,
    chatModel,
    sendChat,
    clearChat,
    stopChat,
    retryChat: retryFromAnchor,
    editAndRetryChat: editAndRetry,
    pendingApprovals,
    decideApproval: onApprovalDecide,
    followLatest,
    setFollowLatest,
    contextFileName: workspace.activeMarkdownRel ? basename(workspace.activeMarkdownRel) : null,
    chatFontSize: settings.chatFontSize,
    sessions,
    activeSessionId: activeId,
    createSession,
    selectSession,
    closeSession,
    changeProviderModel: setActiveSessionProviderModel,
    availableModels,
    getSession,
    chatSystemPreamble,
    problems: lintIssuesApi.issues,
    lintScanState: lintIssuesApi.scanState,
    lintScanError: lintIssuesApi.scanError,
    scanProblems: () => { void lintIssuesApi.scanWorkspace() },
    clearProblems: lintIssuesApi.clearWorkspaceIssues,
    jumpToProblem,
    pricingOverrides: settings.pricingOverrides,
    fileHistoryEnabled: raEnabled,
    fileHistoryTarget,
    fileHistoryNonce,
    fileHistoryHistory: raEnabled ? getCanvHistory() : null,
    onFileHistoryOpenDiff: (r) => handleOpenDiff(r.relPath, r.commitSha, r.baseLabel),
    onFileHistoryRestore: (r) => setRestoreTarget(r),
  }), [
    runs, activeTabId, setActiveTabId, handleCloseTab, applyRunWithSnapshot, handleRerun, refineRun,
    chatMessages, chatBusy, chatProvider, chatModel,
    sendChat, clearChat, stopChat, retryFromAnchor, editAndRetry,
    pendingApprovals, onApprovalDecide, followLatest, setFollowLatest,
    workspace.activeMarkdownRel, settings.chatFontSize, settings.pricingOverrides,
    sessions, activeId, createSession, selectSession, closeSession, setActiveSessionProviderModel, availableModels,
    getSession, chatSystemPreamble,
    lintIssuesApi, jumpToProblem,
    raEnabled, fileHistoryTarget, fileHistoryNonce, handleOpenDiff, setRestoreTarget,
  ])

  const bottomPanelTabs = useMemo(() => buildBottomPanelTabs(bottomPanelAdapter), [bottomPanelAdapter])

  // Browser-only build: show a simple banner instead of the workspace UI.
  if (!isElectron()) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6 bg-app text-default">
        <div className="max-w-md space-y-3">
          <h1 className="text-2xl font-semibold">Canv 0.2 needs the desktop app</h1>
          <p className="text-sm opacity-80">
            This version stores your writing on disk, which the browser preview can't do.
            Download the desktop build (macOS / Windows / Linux) to use file workspaces.
          </p>
          {legacyStateExists() && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => setMigrationOpen(true)}
            >
              Export legacy backup
            </button>
          )}
        </div>
        {migrationOpen && (
          <MigrationModal
            onComplete={() => {
              setMigrationOpen(false)
              window.location.reload()
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {workspace.remoteStatus?.state === 'offline' && (
        <div className="bg-amber-900/40 text-amber-100 px-3 py-1.5 text-sm flex items-center justify-between border-b border-amber-800">
          <span>Remote workspace offline — attempting to reconnect…</span>
          <button
            type="button"
            onClick={() => workspace.reconnect()}
            className="underline hover:no-underline"
          >
            Reconnect now
          </button>
        </div>
      )}
      <TopBar
        workspaceName={workspace.root}
        activeSidebarTab={ideLayout.layout.sidebar.activeTab}
        onSelectSidebarTab={(tab) => {
          const { visible, activeTab } = ideLayout.layout.sidebar
          if (visible && activeTab === tab) {
            ideLayout.toggleSidebar()
            return
          }
          ideLayout.setSidebarTab(tab)
          if (!visible) ideLayout.toggleSidebar()
        }}
        onOpenCommandPalette={() => { setPaletteMode('commands'); setPaletteOpen(true) }}
        profile={activeProfile}
        hasMarkdownTab={workspace.activeMarkdownRel != null}
        activeFileName={workspace.activeMarkdownRel ? basename(workspace.activeMarkdownRel) : null}
        onRunDocAgent={(agent, instruction) => handleAgentOnDocument(workspace.activeGroupId, agent, instruction)}
        sidebarVisible={ideLayout.layout.sidebar.visible}
        bottomVisible={ideLayout.layout.bottom.visible}
        bottomPlacement={ideLayout.layout.bottom.placement}
        onSetBottomPlacementBottom={setBottomPlacementBottom}
        onSetBottomPlacementRight={setBottomPlacementRight}
        historyEnabled={raEnabled}
      />
      <WorkspaceShell
        ideLayout={ideLayout}
        workspace={workspace}
        openRels={openRels}
        pinnedRels={pinnedRels}
        onEditorReady={handleEditorReady}
        onEditorDestroy={handleEditorDestroy}
        onJumperReady={handleJumperReady}
        onJumperDestroy={handleJumperDestroy}
        onEditorChange={handleEditorChange}
        onEditorSelectionChange={handleEditorSelectionChange}
        readLiveBuffer={readLiveBuffer}
        onJumpToMatch={jumpToMatch}
        outlineNodes={outlineNodes}
        focusedKey={focusedKey}
        onOutlineJump={handleOutlineJump}
        onClickBreadcrumbFolder={handleClickBreadcrumbFolder}
        revealFolderRel={revealFolderRel}
        onCreateFile={fileOps.createFile}
        onCreateFolder={fileOps.createFolder}
        onRename={fileOps.rename}
        onDelete={fileOps.remove}
        onChangeWorkspace={fileOps.changeWorkspace}
        onOpenDiff={handleOpenDiff}
        raEnabled={raEnabled}
        onOpenRestore={setRestoreTarget}
        onViewHistory={openFileHistory}
        settings={settings}
        onUpdateSettings={update}
        onExportBackup={() => {
          workspace.flushAll()
          exportBackup()
        }}
        bottomPanelTabs={bottomPanelTabs}
        saveState={saveState}
        activeProfile={activeProfile}
        onClickProfile={profilePicker.openSwitcher}
        apiKeyMissing={apiKeyMissing}
        onClickApiKeyWarning={() => openSettingsTab()}
        cursorLine={cursorPos?.line ?? null}
        cursorCol={cursorPos?.col ?? null}
        onOpenSettings={() => openSettingsTab()}
        onToggleChat={() => {
          const { visible, activeTab } = ideLayout.layout.bottom
          if (visible && activeTab === 'chat') {
            ideLayout.toggleBottom()
          } else {
            if (!visible) ideLayout.toggleBottom()
            ideLayout.showBottomTab('chat')
          }
        }}
        meterTokens={meterTotals.tokens || null}
        meterCostUsd={meterTotals.costUsd || null}
        wordCount={wordCount}
        selectionWordCount={selectionWordCount}
      />

      {restoreTarget && getCanvHistory() && (
        <RestorePreviewDialog
          history={getCanvHistory()!}
          snapshotId={restoreTarget.snapshotId}
          relPath={restoreTarget.relPath}
          onCancel={() => setRestoreTarget(null)}
          onRestored={async (rollbackId) => {
            const rel = restoreTarget.relPath
            setRestoreTarget(null)
            showToast(`Restored ${rel}. Safety snapshot: ${rollbackId}`)
            try { await workspace.reloadTabFromDisk(rel) } catch { /* tab may not be open */ }
          }}
          saveDirtyBuffer={async (_relPath) => {
            // flushAll persists all dirty buffers; it's a no-op when nothing is dirty.
            await workspace.flushAll()
          }}
        />
      )}

      {setup.phase === 'needs-setup' && (
        <WorkspaceSetupModal
          modes={modes.map((m) => ({ id: m.id, label: m.label }))}
          defaultProfile={defaultModeId ?? modes[0]?.id ?? 'fiction'}
          remote={workspace.kind?.kind === 'remote' ? true : false}
          onConfirm={async (r) => {
            try {
              await setup.confirm(r)
            } catch (e) {
              showToast(`Setup failed: ${(e as Error).message}`)
            }
          }}
          onCancel={async () => {
            setup.cancel()
            try { await getFs().closeWorkspace() } catch { /* ignore */ }
          }}
        />
      )}

      <FloatingToolbar
        view={activeEditor}
        selectionVersion={selectionTick}
        profile={activeProfile}
        onAgent={handleAgentFromToolbar}
      />

      <AppOverlays
        profilePicker={profilePicker}
        migrationOpen={migrationOpen}
        onMigrationComplete={() => { setMigrationOpen(false); window.location.reload() }}
        workspace={workspace}
        editorsRef={editorsRef}
        fileOps={fileOps}
        pendingDocAgent={pendingDocAgent}
        onSubmitDocAgent={(instruction) => {
          handleAgentOnDocument(workspace.activeGroupId, pendingDocAgent!, instruction)
          setPendingDocAgent(null)
        }}
        onCancelDocAgent={() => setPendingDocAgent(null)}
        notifications={notifications}
        onUndoRetry={undoRetry}
        paletteOpen={paletteOpen}
        paletteMode={paletteMode}
        paletteFiles={paletteFiles}
        paletteRecents={paletteRecents}
        onClosePalette={() => setPaletteOpen(false)}
        commands={commands}
        onOpenFile={(rel) => { void workspace.openTab(rel) }}
      />
    </div>
  )
}
