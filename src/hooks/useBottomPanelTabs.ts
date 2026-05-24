import { useCallback, useMemo } from 'react'
import { useService } from '../services/useService'
import { buildBottomPanelTabs, type BottomPanelTabsAdapter } from '../components/ide/bottomPanelTabs'
import { getCanvHistory } from '../lib/history'
import { flattenTree } from '../lib/fs'
import { buildChatSystemPreamble } from '../lib/buildChatSystemPreamble'
import { getAdapter, configuredProviders } from '../adapters'
import type { Provider } from '../adapters'
import type { ChatProvider } from '../components/ChatPanel'
import type { LintIssue } from '../lib/lintTypes'
import type { FileHistoryOpenDiff, FileHistoryRestore } from '../components/ide/bottom/FileHistoryTab'

function basename(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i >= 0 ? rel.slice(i + 1) : rel
}

/** Inputs the hook can't derive from services — App-local UI state. */
export interface UseBottomPanelTabsArgs {
  /** App-local UI state: rel path of file whose history tab is showing. */
  fileHistoryTarget: string | null
  /** App-local UI state: nonce bumped on each openFileHistory call so the tab refreshes. */
  fileHistoryNonce: number
  /** App-local UI state setter for the restore-preview dialog. */
  onOpenRestore: (target: { snapshotId: string; relPath: string }) => void
}

/**
 * Builds the bottom-panel tabs array from services + App-local UI state.
 *
 * Everything except the file-history target/nonce and the restore setter is
 * derived from services here, so AppInner doesn't need to manufacture
 * availableModels / chatSystemPreamble / raEnabled just to pass them through.
 */
export function useBottomPanelTabs(args: UseBottomPanelTabsArgs) {
  const workspace = useService('workspace')
  const settings = useService('settings').settings
  const chatSessions = useService('chatSessions')
  const lint = useService('lint')
  const editorRegistry = useService('editorRegistry')
  const setup = useService('setup')
  const modesSvc = useService('modes')

  const { fileHistoryTarget, fileHistoryNonce, onOpenRestore } = args
  const raEnabled = setup.config?.revisionArchaeology.enabled === true

  // Active profile derivation — mirrors ServicesProvider.
  const activeProfileId = modesSvc.profile ?? modesSvc.defaultModeId
  const activeProfile =
    modesSvc.modes.find((m) => m.id === activeProfileId) ??
    modesSvc.modes.find((m) => m.id === modesSvc.defaultModeId)!

  const chatSystemPreamble = useMemo(
    () => buildChatSystemPreamble({ activeProfile }),
    [activeProfile],
  )

  const { chatMessages, chatProvider } = chatSessions
  const availableModels: Record<ChatProvider, string[]> = useMemo(() => {
    const visible = new Set<Provider>(configuredProviders({
      apiKeys: settings.apiKeys,
      baseUrls: settings.baseUrls,
      ollamaModels: settings.ollamaModels,
    }))
    // Preserve the active session's provider only when the chat is locked (has messages) —
    // an empty session inherited settings.provider and shouldn't keep an unconfigured
    // provider visible just because it's the current default.
    if (chatMessages.length > 0) visible.add(chatProvider as Provider)
    if (visible.size === 0) {
      // Nothing configured and no locked chat to preserve — fall back to the full list
      // so the picker isn't empty.
      ;(['anthropic', 'openai', 'ollama'] as Provider[]).forEach((p) => visible.add(p))
    }
    const result = {} as Record<ChatProvider, string[]>
    for (const id of visible) {
      result[id as ChatProvider] = id === 'ollama'
        ? settings.ollamaModels
        : getAdapter(id).models
    }
    return result
  }, [settings.apiKeys, settings.baseUrls, settings.ollamaModels, chatProvider, chatMessages.length])

  const workspaceFiles: string[] = useMemo(() => {
    const tree = workspace.tree
    if (!tree) return []
    return flattenTree(tree)
      .filter((n) => n.kind === 'file')
      .map((n) => n.relPath)
      .sort()
  }, [workspace.tree])

  const onOpenDiff = useCallback(
    (rel: string, baseRef: string = 'HEAD', baseLabel?: string) => {
      workspace.openDiffTab(rel, baseRef, baseLabel)
    },
    [workspace],
  )

  const jumpToProblem = useCallback(
    (issue: LintIssue) => {
      void editorRegistry.jumpToProblem(issue, lint.issues)
    },
    [editorRegistry, lint.issues],
  )

  const adapter = useMemo<BottomPanelTabsAdapter>(() => ({
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
    workspaceFiles,
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
    chatSessions, lint, jumpToProblem,
    availableModels, workspaceFiles, chatSystemPreamble,
    raEnabled, fileHistoryTarget, fileHistoryNonce,
    onOpenDiff, onOpenRestore,
  ])

  return useMemo(() => buildBottomPanelTabs(adapter), [adapter])
}
