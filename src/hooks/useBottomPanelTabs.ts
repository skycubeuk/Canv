import { useCallback, useMemo } from 'react'
import { useService } from '../services/useService'
import { buildBottomPanelTabs, type BottomPanelTabsAdapter } from '../components/ide/bottomPanelTabs'
import { getCanvHistory } from '../lib/history'
import type { ChatProvider } from '../components/ChatPanel'
import type { RunRecord } from '../components/ResultsPanel'
import type { LintIssue } from '../lib/lintTypes'
import type { FileHistoryOpenDiff, FileHistoryRestore } from '../components/ide/bottom/FileHistoryTab'

function basename(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i >= 0 ? rel.slice(i + 1) : rel
}

/** Inputs the hook can't derive from services — App-local UI state and
 *  closures composed in App.tsx. Everything else flows in via useService. */
export interface UseBottomPanelTabsArgs {
  /** App-local UI state: rel path of file whose history tab is showing. */
  fileHistoryTarget: string | null
  /** App-local UI state: nonce bumped on each openFileHistory call so the tab refreshes. */
  fileHistoryNonce: number
  /** App-local flag: revision-archaeology enabled per workspace setup config. */
  raEnabled: boolean
  /** App-local closures (touch workspace/history/notifications outside the service surface). */
  applyRunWithSnapshot: (run: RunRecord, text: string) => void
  availableModels: Record<ChatProvider, string[]>
  chatSystemPreamble: string
  onOpenDiff: (rel: string, baseRef?: string, baseLabel?: string) => void
  onOpenRestore: (target: { snapshotId: string; relPath: string }) => void
}

/**
 * Builds the bottom-panel tabs array from services + App-local UI state.
 *
 * This replaces a ~57-line dependency array `useMemo` that previously lived
 * in App.tsx. Services handle their own change-detection so the hook only
 * lists the App-local arg references in its deps; everything inside the
 * memo dereferences fresh service values on each call.
 */
export function useBottomPanelTabs(args: UseBottomPanelTabsArgs) {
  const workspace = useService('workspace')
  const settings = useService('settings').settings
  const selectionAgent = useService('selectionAgent')
  const chatSessions = useService('chatSessions')
  const lint = useService('lint')
  const editorRegistry = useService('editorRegistry')

  const {
    fileHistoryTarget, fileHistoryNonce, raEnabled,
    applyRunWithSnapshot, availableModels, chatSystemPreamble,
    onOpenDiff, onOpenRestore,
  } = args

  const jumpToProblem = useCallback(
    (issue: LintIssue) => {
      void editorRegistry.jumpToProblem(issue, lint.issues)
    },
    [editorRegistry, lint.issues],
  )

  const adapter = useMemo<BottomPanelTabsAdapter>(() => ({
    // Runs
    runs: selectionAgent.runs,
    activeRunId: selectionAgent.activeTabId,
    selectRun: selectionAgent.setActiveTabId,
    closeRun: selectionAgent.handleCloseTab,
    applyRun: applyRunWithSnapshot,
    rerunRun: selectionAgent.handleRerun,
    refineRun: selectionAgent.refineRun,

    // Chat
    chatMessages: chatSessions.chatMessages,
    chatBusy: chatSessions.chatBusy,
    chatProvider: chatSessions.chatProvider,
    chatModel: chatSessions.chatModel,
    sendChat: chatSessions.sendChat,
    clearChat: chatSessions.clearChat,
    stopChat: chatSessions.stopChat,
    retryChat: chatSessions.retryFromAnchor,
    editAndRetryChat: chatSessions.editAndRetry,
    pendingApprovals: chatSessions.pendingApprovals,
    decideApproval: chatSessions.onApprovalDecide,
    followLatest: chatSessions.followLatest,
    setFollowLatest: chatSessions.setFollowLatest,
    contextFileName: workspace.activeMarkdownRel ? basename(workspace.activeMarkdownRel) : null,
    chatFontSize: settings.chatFontSize,

    // Sessions
    sessions: chatSessions.sessions,
    activeSessionId: chatSessions.activeId,
    createSession: chatSessions.createSession,
    selectSession: chatSessions.selectSession,
    closeSession: chatSessions.closeSession,
    changeProviderModel: chatSessions.setActiveSessionProviderModel,
    availableModels,
    getSession: chatSessions.getSession,
    chatSystemPreamble,

    // Problems
    problems: lint.issues,
    lintScanState: lint.scanState,
    lintScanError: lint.scanError,
    scanProblems: () => { void lint.scanWorkspace() },
    clearProblems: lint.clearWorkspaceIssues,
    jumpToProblem,

    // Settings
    pricingOverrides: settings.pricingOverrides,

    // File history
    fileHistoryEnabled: raEnabled,
    fileHistoryTarget,
    fileHistoryNonce,
    fileHistoryHistory: raEnabled ? getCanvHistory() : null,
    onFileHistoryOpenDiff: (r: FileHistoryOpenDiff) => onOpenDiff(r.relPath, r.commitSha, r.baseLabel),
    onFileHistoryRestore: (r: FileHistoryRestore) => onOpenRestore(r),
  }), [
    workspace.activeMarkdownRel,
    settings.chatFontSize, settings.pricingOverrides,
    selectionAgent, chatSessions, lint, jumpToProblem,
    applyRunWithSnapshot, availableModels, chatSystemPreamble,
    raEnabled, fileHistoryTarget, fileHistoryNonce,
    onOpenDiff, onOpenRestore,
  ])

  return useMemo(() => buildBottomPanelTabs(adapter), [adapter])
}
