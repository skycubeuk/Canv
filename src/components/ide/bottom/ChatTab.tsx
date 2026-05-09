import { ChatPanel, type ChatMessage, type PendingApproval, type ChatProvider } from '../../ChatPanel'
import type { ApprovalDecision } from '../../../agents/chatRunner'
import type { SidebarSession } from '../../ChatSessionsSidebar'

interface Props {
  messages: ChatMessage[]
  busy: boolean
  provider: string
  model: string
  onSend: (text: string) => void
  onClear: () => void
  onStop: () => void
  onRetry: (anchorId: string) => void
  onEditAndRetry: (newText: string) => void
  pendingApprovals?: Map<string, PendingApproval>
  onApprovalDecide?: (callId: string, decision: ApprovalDecision) => void
  pricingOverrides: Record<string, import('../../../config/pricing').ModelPricing>
  followLatest: boolean
  onSetFollowLatest: (next: boolean) => void
  contextFileName: string | null
  chatFontSize: number
  sessions: SidebarSession[]
  activeId: string
  onCreateSession: () => void
  onSelectSession: (id: string) => void
  onCloseSession: (id: string) => void
  onChangeProviderModel: (provider: ChatProvider, model: string) => void
  availableModels: Record<ChatProvider, string[]>
}

export function ChatTab(props: Props) {
  return (
    <ChatPanel
      messages={props.messages}
      busy={props.busy}
      provider={props.provider}
      model={props.model}
      onSend={props.onSend}
      onClear={props.onClear}
      onStop={props.onStop}
      onRetry={props.onRetry}
      onEditAndRetry={props.onEditAndRetry}
      pendingApprovals={props.pendingApprovals}
      onApprovalDecide={props.onApprovalDecide}
      pricingOverrides={props.pricingOverrides}
      followLatest={props.followLatest}
      onSetFollowLatest={props.onSetFollowLatest}
      contextFileName={props.contextFileName}
      chatFontSize={props.chatFontSize}
      sessions={props.sessions}
      activeId={props.activeId}
      onCreateSession={props.onCreateSession}
      onSelectSession={props.onSelectSession}
      onCloseSession={props.onCloseSession}
      onChangeProviderModel={props.onChangeProviderModel}
      availableModels={props.availableModels}
    />
  )
}
