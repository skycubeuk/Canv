import type { RunRecord } from '../components/ResultsPanel'
import type { ChatMessage, ChatProvider, PendingApproval } from '../components/ChatPanel'
import type { SidebarSession } from '../components/ChatSessionsSidebar'
import type { ChatSession } from '../hooks/useChatSessions'
import type { ApprovalDecision } from '../agents/chatRunner'
import type { LintIssue } from './lintTypes'
import type { ScanState } from '../hooks/useLintIssues'
import type { BottomTab } from '../hooks/useIdeLayout'
import type { ThemeId } from './themes'
import type { ModelPricing } from '../config/pricing'

/** A run as broadcast to the pop-out, with main-side parsing already applied. */
export interface DockRun extends RunRecord {
  /** Parsed feedback section (from parseAgentResponse), if any. */
  parsedFeedback?: string
  /** Parsed rewrite section (from parseAgentResponse), if any. */
  parsedRewrite?: string
  /** Agent's outputMode, so the popout can choose section headings. */
  outputMode?: string
}

/** Snapshot of all dock-relevant state, broadcast from main → pop-out. */
export interface DockState {
  activeTab: BottomTab
  activeRunId: string | null
  runs: DockRun[]

  // Chat
  chatMessages: ChatMessage[]
  chatProvider: ChatProvider
  chatModel: string
  chatBusy: boolean
  /** Serialised as entries because Map doesn't survive structured clone in some browsers / postMessage paths cleanly. */
  pendingApprovals: Array<[string, PendingApproval]>
  followLatest: boolean
  contextFileName: string | null
  chatFontSize: number
  pricingOverrides: Record<string, ModelPricing>

  // Chat sessions
  sessions: SidebarSession[]
  /** Full session records for every session, so the popout can power its
   *  Output-tab chat inspector without sharing the main hook's closure. */
  chatSessionsFull: ChatSession[]
  /** System preamble the chat runner is currently injecting; rebuilt on the
   *  main side so the popout's chat inspector matches what the model sees. */
  chatSystemPreamble: string
  activeSessionId: string
  availableModels: Record<ChatProvider, string[]>
  /** Workspace files (forward-slash relative paths) — feeds the @-mention
   *  picker in the popout's ChatPanel. */
  workspaceFiles: string[]

  // File history (Revision Archaeology v2 UX)
  revisionArchaeologyEnabled: boolean
  fileHistoryTarget: string | null
  fileHistoryNonce: number

  // Problems
  problems: LintIssue[]
  lintScanState: ScanState
  lintScanError: string | null

  // Extension-contributed bottom-dock panels. The pop-out renders these as
  // additional tabs after the built-ins; the WebContentsView for each is
  // hosted (and reparented) by the main process via canvExtensions:showPanelInSlot.
  bottomDockExtensionPanels: Array<{ extensionId: string; id: string; title: string }>

  // Output / runs streaming
  streamingRunId: string | null

  ui: {
    theme: ThemeId
    fontSize: number
    profileLabel: string | null
  }
}

/** Messages dispatched from pop-out → main when the user interacts. */
export type UserAction =
  // Tabs / runs
  | { type: 'select-tab'; tabId: BottomTab }
  | { type: 'select-run'; runId: string | null }
  | { type: 'rerun-agent'; runId: string }
  | { type: 'delete-run'; runId: string }
  | { type: 'apply-run'; runId: string }
  | { type: 'refine-run'; runId: string; message: string }
  // Chat — turn control
  | { type: 'send-chat'; text: string }
  | { type: 'clear-chat' }
  | { type: 'stop-chat' }
  | { type: 'retry-chat'; anchorId: string }
  | { type: 'edit-and-retry-chat'; newText: string }
  | { type: 'approval-decide'; callId: string; decision: ApprovalDecision }
  | { type: 'set-follow-latest'; value: boolean }
  // Chat — sessions
  | { type: 'create-session' }
  | { type: 'select-session'; id: string }
  | { type: 'close-session'; id: string }
  | { type: 'change-provider-model'; provider: ChatProvider; model: string }
  // Problems
  | { type: 'scan-problems' }
  | { type: 'clear-problems' }
  | { type: 'jump-to-problem'; issue: LintIssue }
  // File history
  | { type: 'open-file-history'; relPath: string }
  | { type: 'file-history-open-diff'; req: { kind: 'fileHistory'; relPath: string; snapshotId: string; commitSha: string; baseLabel: string } }
  | { type: 'file-history-restore'; snapshotId: string; relPath: string }
  // Layout
  | { type: 'set-placement'; placement: 'bottom' | 'right' }

/** Bridge surface exposed by the Electron preload as `window.canvDock`. */
export interface CanvDockBridge {
  /** Called by main to open the pop-out window. Returns when the second window has loaded. */
  openPopout: () => Promise<void>
  /** Called by main to destroy the pop-out window. */
  closePopout: () => Promise<void>
  /** Called by main to push a state snapshot. No-op when no pop-out is open. */
  pushState: (state: DockState) => void
  /** Called by main to subscribe to user actions originating in the pop-out. */
  onUserAction: (cb: (action: UserAction) => void) => () => void
  /** Called by main to learn when the pop-out window closes (externally or via closePopout). */
  onPopoutClosed: (cb: () => void) => () => void
  /** Called by main to learn when the pop-out window has finished mounting. */
  onPopoutReady: (cb: () => void) => () => void

  // ----- pop-out side -----
  /** Called by pop-out to subscribe to state snapshots from main. */
  onState: (cb: (state: DockState) => void) => () => void
  /** Called by pop-out to send a user action to main. */
  sendAction: (action: UserAction) => void
  /** Called by pop-out once it has finished mounting; main responds with an immediate state snapshot. */
  ready: () => void
}

declare global {
  interface Window {
    canvDock?: CanvDockBridge
  }
}
