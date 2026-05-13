import { useEffect, useMemo, useRef } from 'react'
import { useDockBridge } from './useDockBridge'
import { parseAgentResponse } from '../agents/runner'
import { getActionById, getModeById } from './useModes'
import type { Mode } from '../config/types'
import type { ChatMessage, ChatProvider, PendingApproval } from '../components/ChatPanel'
import type { SidebarSession } from '../components/ChatSessionsSidebar'
import type { ApprovalDecision } from '../agents/chatRunner'
import { type RunRecord } from '../components/ResultsPanel'
import type { LintIssue } from '../lib/lintTypes'
import type { DockState, DockRun, UserAction } from '../lib/dockTypes'
import type { useIdeLayout } from './useIdeLayout'
import type { useSettings } from './useSettings'
import type { ScanState } from './useLintIssues'
import type { ModelPricing } from '../config/pricing'

type IdeLayoutApi = ReturnType<typeof useIdeLayout>
type SettingsApi = ReturnType<typeof useSettings>

export interface UseDockBridgeMainArgs {
  ideLayout: IdeLayoutApi
  modes: Mode[]
  defaultModeId: string
  activeProfile: Mode
  // Runs
  runs: RunRecord[]
  activeTabId: string | null
  setActiveTabId: React.Dispatch<React.SetStateAction<string | null>>
  handleRerun: (run: RunRecord) => void
  handleCloseTab: (id: string) => void
  handleApply: (run: RunRecord, replacement: string) => void
  refineRun: (run: RunRecord, message: string) => Promise<void>
  // Chat — base
  chatMessages: ChatMessage[]
  chatProvider: ChatProvider
  chatModel: string
  chatBusy: boolean
  pendingApprovals: Map<string, PendingApproval>
  followLatest: boolean
  contextFileName: string | null
  // Chat — sessions
  sessions: SidebarSession[]
  chatSessionsFull: import('../hooks/useChatSessions').ChatSession[]
  chatSystemPreamble: string
  activeSessionId: string
  availableModels: Record<ChatProvider, string[]>
  // Chat — actions
  sendChat: (text: string) => Promise<void> | void
  clearChat: () => void
  stopChat: () => void
  retryFromAnchor: (anchorId: string) => void
  editAndRetry: (newText: string) => void
  onApprovalDecide: (callId: string, decision: ApprovalDecision) => void
  setFollowLatest: (next: boolean) => void
  createSession: () => void
  selectSession: (id: string) => void
  closeSession: (id: string) => void
  setActiveSessionProviderModel: (provider: ChatProvider, model: string) => void
  // Problems
  problems: LintIssue[]
  lintScanState: ScanState
  lintScanError: string | null
  scanProblems: () => void
  clearProblems: () => void
  jumpToProblem: (issue: LintIssue) => void
  // Settings (for serialisable bits the popout needs)
  settings: SettingsApi['settings']
  pricingOverrides: Record<string, ModelPricing>
  // File history
  revisionArchaeologyEnabled: boolean
  fileHistoryTarget: string | null
  fileHistoryNonce: number
  onOpenFileHistory: (rel: string) => void
  onFileHistoryOpenDiff: (r: { kind: 'fileHistory'; relPath: string; snapshotId: string; commitSha: string; baseLabel: string }) => void
  onFileHistoryRestore: (snapshotId: string, relPath: string) => void
}

export function useDockBridgeMain(args: UseDockBridgeMainArgs): void {
  const {
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
    contextFileName,
    sessions,
    chatSessionsFull,
    chatSystemPreamble,
    activeSessionId,
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
    problems,
    lintScanState,
    lintScanError,
    scanProblems,
    clearProblems,
    jumpToProblem,
    settings,
    pricingOverrides,
    revisionArchaeologyEnabled,
    fileHistoryTarget,
    fileHistoryNonce,
    onOpenFileHistory,
    onFileHistoryOpenDiff,
    onFileHistoryRestore,
  } = args

  // Parse each run on the main side so the popout can render Notes / Rewrite / Diff
  // sections without needing useModes() of its own.
  const dockRuns = useMemo<DockRun[]>(() => {
    return runs.map((r) => {
      const mode = getModeById(modes, r.modeId) ?? getModeById(modes, defaultModeId)
      const agent = mode ? getActionById(mode, r.agentId) : null
      if (!agent) return { ...r }
      const parsed = parseAgentResponse(agent, r.response)
      return {
        ...r,
        parsedFeedback: parsed.feedback,
        parsedRewrite: parsed.rewrite,
        outputMode: agent.outputMode,
      }
    })
  }, [runs, modes, defaultModeId])

  const pendingApprovalsArr = useMemo<Array<[string, PendingApproval]>>(
    () => Array.from(pendingApprovals.entries()),
    [pendingApprovals],
  )

  // Assemble the snapshot the pop-out window mirrors. Recomputed on any input change;
  // useDockBridge throttles broadcasts to ~30fps so streaming token updates don't flood IPC.
  const dockState = useMemo<DockState>(() => {
    const streamingRunId = dockRuns.find((r) => r.status === 'streaming' || r.status === 'refining')?.id ?? null
    return {
      activeTab: ideLayout.layout.bottom.activeTab,
      activeRunId: activeTabId,
      runs: dockRuns,
      chatMessages,
      chatProvider,
      chatModel,
      chatBusy,
      pendingApprovals: pendingApprovalsArr,
      followLatest,
      contextFileName,
      chatFontSize: settings.chatFontSize,
      pricingOverrides,
      sessions,
      chatSessionsFull,
      chatSystemPreamble,
      activeSessionId,
      availableModels,
      revisionArchaeologyEnabled,
      fileHistoryTarget,
      fileHistoryNonce,
      problems,
      lintScanState,
      lintScanError,
      streamingRunId,
      ui: {
        theme: settings.theme,
        accent: settings.accent,
        fontSize: settings.fontSize,
        profileLabel: activeProfile?.label ?? null,
      },
    }
  }, [
    ideLayout.layout.bottom.activeTab,
    activeTabId,
    dockRuns,
    chatMessages,
    chatProvider,
    chatModel,
    chatBusy,
    pendingApprovalsArr,
    followLatest,
    contextFileName,
    sessions,
    chatSessionsFull,
    chatSystemPreamble,
    activeSessionId,
    availableModels,
    revisionArchaeologyEnabled,
    fileHistoryTarget,
    fileHistoryNonce,
    problems,
    lintScanState,
    lintScanError,
    settings.theme,
    settings.accent,
    settings.fontSize,
    settings.chatFontSize,
    pricingOverrides,
    activeProfile,
  ])

  const dockBridge = useDockBridge({ mode: 'main' })

  // Push every snapshot change to the pop-out (no-op when no pop-out is open).
  useEffect(() => {
    dockBridge.broadcastState(dockState)
  }, [dockBridge, dockState])

  // Round-trip guard: the pop-out's `closed` event fires for both external
  // closes (user clicked the X) AND renderer-initiated closes (we just called
  // closePopout because placement changed). Only revert when placement is
  // STILL 'popout' at the time the close arrives.
  //
  // Declaration order matters: this ref-sync effect must run BEFORE the
  // placement → openPopout/closePopout effect below, so the ref is always
  // current before anything could trigger closePopout. That keeps the guard
  // correctness order-independent w.r.t. IPC sync/async behaviour and
  // potential future React concurrent-flush changes.
  const placement = ideLayout.layout.bottom.placement
  const placementRef = useRef(placement)
  useEffect(() => { placementRef.current = placement }, [placement])

  // Open / close the pop-out window when placement or visibility changes.
  // - placement === 'popout' && visible → open (covers cold boot restore AND
  //   re-show after the user closed the popout and then triggered a show-dock
  //   action such as Ctrl+`, a focus-tab shortcut, or the chat button).
  // - anything else → close (no-op when no window exists).
  const visible = ideLayout.layout.bottom.visible
  useEffect(() => {
    if (!dockBridge.isAvailable) return
    if (placement === 'popout' && visible) {
      void dockBridge.openPopout()
    } else {
      void dockBridge.closePopout()
    }
  }, [dockBridge, placement, visible])

  useEffect(() => {
    if (!dockBridge.isAvailable) return
    dockBridge.setPopoutClosedHandler(() => {
      // External close (e.g. user clicked the OS close button on the popped window).
      // Hide the dock entirely — same as clicking the X on the in-app bottom panel.
      // Placement stays 'popout' so the next show-dock action (Ctrl+`, focus-tab
      // shortcut, etc.) re-opens the popout window.
      if (placementRef.current === 'popout' && ideLayout.layout.bottom.visible) {
        ideLayout.toggleBottom()
      }
    })
  }, [dockBridge, ideLayout])

  // Dispatch user actions arriving from the pop-out through the same handlers
  // the in-app UI uses.
  useEffect(() => {
    if (!dockBridge.isAvailable) return
    dockBridge.setActionHandler((action: UserAction) => {
      switch (action.type) {
        case 'select-tab':
          ideLayout.setBottomTab(action.tabId)
          return
        case 'select-run':
          setActiveTabId(action.runId)
          return
        case 'rerun-agent': {
          const run = runs.find((r) => r.id === action.runId)
          if (run) handleRerun(run)
          return
        }
        case 'delete-run':
          handleCloseTab(action.runId)
          return
        case 'apply-run': {
          const run = runs.find((r) => r.id === action.runId)
          if (!run) return
          const dock = dockRuns.find((r) => r.id === action.runId)
          const text = dock?.parsedRewrite ?? run.response
          if (text) handleApply(run, text)
          return
        }
        case 'refine-run': {
          const run = runs.find((r) => r.id === action.runId)
          if (run) void refineRun(run, action.message)
          return
        }
        case 'send-chat':
          void sendChat(action.text)
          return
        case 'clear-chat':
          clearChat()
          return
        case 'stop-chat':
          stopChat()
          return
        case 'retry-chat':
          retryFromAnchor(action.anchorId)
          return
        case 'edit-and-retry-chat':
          editAndRetry(action.newText)
          return
        case 'approval-decide':
          onApprovalDecide(action.callId, action.decision)
          return
        case 'set-follow-latest':
          setFollowLatest(action.value)
          return
        case 'create-session':
          createSession()
          return
        case 'select-session':
          selectSession(action.id)
          return
        case 'close-session':
          closeSession(action.id)
          return
        case 'change-provider-model':
          setActiveSessionProviderModel(action.provider, action.model)
          return
        case 'scan-problems':
          scanProblems()
          return
        case 'clear-problems':
          clearProblems()
          return
        case 'jump-to-problem':
          jumpToProblem(action.issue)
          return
        case 'open-file-history':
          onOpenFileHistory(action.relPath)
          return
        case 'file-history-open-diff':
          onFileHistoryOpenDiff(action.req)
          return
        case 'file-history-restore':
          onFileHistoryRestore(action.snapshotId, action.relPath)
          return
        case 'set-placement':
          ideLayout.setDockPlacement(action.placement)
          return
      }
    })
  }, [
    dockBridge, ideLayout, runs, dockRuns,
    sendChat, handleRerun, handleCloseTab, handleApply, refineRun,
    clearChat, stopChat, retryFromAnchor, editAndRetry, onApprovalDecide,
    setFollowLatest, createSession, selectSession, closeSession, setActiveSessionProviderModel,
    scanProblems, clearProblems, jumpToProblem,
    onOpenFileHistory, onFileHistoryOpenDiff, onFileHistoryRestore,
    setActiveTabId,
  ])

  // Push an immediate snapshot when the pop-out signals ready, so the freshly
  // mounted window doesn't render an empty UI before the next state change.
  const dockStateRef = useRef(dockState)
  useEffect(() => { dockStateRef.current = dockState }, [dockState])

  useEffect(() => {
    if (!dockBridge.isAvailable) return
    dockBridge.setPopoutReadyHandler(() => {
      dockBridge.broadcastState(dockStateRef.current)
    })
  }, [dockBridge])
}
