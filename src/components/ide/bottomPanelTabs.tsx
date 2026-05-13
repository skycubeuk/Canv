import { Play, MessageSquare, AlertTriangle, FileText, History } from 'lucide-react'
import type { BottomPanelTabDef } from './BottomPanel'
import { RunsTab } from './bottom/RunsTab'
import { ChatTab } from './bottom/ChatTab'
import { ProblemsTab } from './bottom/ProblemsTab'
import { OutputTab } from './bottom/OutputTab'
import { FileHistoryTab } from './bottom/FileHistoryTab'
import type { ChatMessage, ChatProvider, PendingApproval } from '../ChatPanel'
import type { SidebarSession } from '../ChatSessionsSidebar'
import type { ApprovalDecision } from '../../agents/chatRunner'
import type { RunRecord } from '../ResultsPanel'
import type { LintIssue } from '../../lib/lintTypes'
import type { ScanState } from '../../hooks/useLintIssues'
import type { ModelPricing } from '../../config/pricing'

/** Everything the bottom-panel tabs need to render and react to interaction.
 *
 *  Both the in-window panel and the pop-out window build a `BottomPanelTabs`
 *  by passing one of these in. The main window wires it directly to the
 *  app-level handlers; the pop-out wires it to dispatch actions over the IPC
 *  bridge. With a single factory, the two windows render the same components
 *  by construction and can never drift.
 */
export interface BottomPanelTabsAdapter {
  // Runs
  runs: RunRecord[]
  activeRunId: string | null
  selectRun: (id: string) => void
  closeRun: (id: string) => void
  applyRun: (run: RunRecord, text: string) => void
  rerunRun: (run: RunRecord) => void
  refineRun: (run: RunRecord, message: string) => void

  // Chat
  chatMessages: ChatMessage[]
  chatBusy: boolean
  chatProvider: string
  chatModel: string
  sendChat: (text: string) => void
  clearChat: () => void
  stopChat: () => void
  retryChat: (anchorId: string) => void
  editAndRetryChat: (newText: string) => void
  pendingApprovals: Map<string, PendingApproval>
  decideApproval: (callId: string, decision: ApprovalDecision) => void
  followLatest: boolean
  setFollowLatest: (next: boolean) => void
  contextFileName: string | null
  chatFontSize: number

  // Sessions
  sessions: SidebarSession[]
  activeSessionId: string
  createSession: () => void
  selectSession: (id: string) => void
  closeSession: (id: string) => void
  changeProviderModel: (provider: ChatProvider, model: string) => void
  availableModels: Record<ChatProvider, string[]>

  // Output tab — chat inspector (optional; popout window omits these for v1)
  getSession?: (id: string) => import('../../hooks/useChatSessions').ChatSession | null
  chatSystemPreamble?: string

  // Problems
  problems: LintIssue[]
  lintScanState: ScanState
  lintScanError: string | null
  scanProblems: () => void
  clearProblems: () => void
  jumpToProblem: (issue: LintIssue) => void

  // Settings (subset the tabs need)
  pricingOverrides: Record<string, ModelPricing>

  // File history
  fileHistoryEnabled: boolean
  fileHistoryTarget: string | null
  fileHistoryNonce: number
  fileHistoryHistory: import('../../lib/history').CanvHistory | null
  onFileHistoryOpenDiff: (r: import('./bottom/FileHistoryTab').FileHistoryOpenDiff) => void
  onFileHistoryRestore: (r: import('./bottom/FileHistoryTab').FileHistoryRestore) => void
}

export function buildBottomPanelTabs(adapter: BottomPanelTabsAdapter): BottomPanelTabDef[] {
  return [
    {
      id: 'runs',
      label: 'Runs',
      icon: Play,
      badge: adapter.runs.length > 0 ? adapter.runs.length : undefined,
      render: () => (
        <RunsTab
          runs={adapter.runs}
          activeId={adapter.activeRunId}
          onSelect={adapter.selectRun}
          onClose={adapter.closeRun}
          onApply={adapter.applyRun}
          onRerun={adapter.rerunRun}
          onRefine={adapter.refineRun}
          pricingOverrides={adapter.pricingOverrides}
        />
      ),
    },
    {
      id: 'chat',
      label: 'Chat',
      icon: MessageSquare,
      badge: adapter.chatMessages.length > 0 ? adapter.chatMessages.length : undefined,
      render: () => (
        <ChatTab
          messages={adapter.chatMessages}
          busy={adapter.chatBusy}
          provider={adapter.chatProvider}
          model={adapter.chatModel}
          onSend={adapter.sendChat}
          onClear={adapter.clearChat}
          onStop={adapter.stopChat}
          onRetry={adapter.retryChat}
          onEditAndRetry={adapter.editAndRetryChat}
          pendingApprovals={adapter.pendingApprovals}
          onApprovalDecide={adapter.decideApproval}
          pricingOverrides={adapter.pricingOverrides}
          followLatest={adapter.followLatest}
          onSetFollowLatest={adapter.setFollowLatest}
          contextFileName={adapter.contextFileName}
          chatFontSize={adapter.chatFontSize}
          sessions={adapter.sessions}
          activeId={adapter.activeSessionId}
          onCreateSession={adapter.createSession}
          onSelectSession={adapter.selectSession}
          onCloseSession={adapter.closeSession}
          onChangeProviderModel={adapter.changeProviderModel}
          availableModels={adapter.availableModels}
        />
      ),
    },
    {
      id: 'problems',
      label: 'Problems',
      icon: AlertTriangle,
      badge: adapter.problems.length > 0 ? adapter.problems.length : undefined,
      render: () => (
        <ProblemsTab
          issues={adapter.problems}
          scanState={adapter.lintScanState}
          scanError={adapter.lintScanError}
          onScan={adapter.scanProblems}
          onClear={adapter.clearProblems}
          onJump={adapter.jumpToProblem}
        />
      ),
    },
    {
      id: 'output',
      label: 'Output',
      icon: FileText,
      render: () => (
        <OutputTab
          runs={adapter.runs}
          sessions={adapter.sessions}
          activeSessionId={adapter.activeSessionId}
          getSession={adapter.getSession}
          chatSystemPreamble={adapter.chatSystemPreamble}
        />
      ),
    },
    ...(adapter.fileHistoryEnabled && adapter.fileHistoryHistory ? [{
      id: 'fileHistory' as const,
      label: 'History',
      icon: History,
      render: () => (
        <FileHistoryTab
          target={adapter.fileHistoryTarget}
          nonce={adapter.fileHistoryNonce}
          history={adapter.fileHistoryHistory!}
          onOpenDiff={adapter.onFileHistoryOpenDiff}
          onRestore={adapter.onFileHistoryRestore}
        />
      ),
    }] : []),
  ]
}
