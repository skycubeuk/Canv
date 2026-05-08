import { ChatPanel, type ChatMessage, type PendingApproval } from '../../ChatPanel'
import type { ApprovalDecision } from '../../../agents/chatRunner'

interface Props {
  messages: ChatMessage[]
  busy: boolean
  provider: string
  model: string
  onSend: (text: string) => void
  onClear: () => void
  onStop: () => void
  pendingApprovals?: Map<string, PendingApproval>
  onApprovalDecide?: (callId: string, decision: ApprovalDecision) => void
  pricingOverrides: Record<string, import('../../../config/pricing').ModelPricing>
  followLatest: boolean
  onSetFollowLatest: (next: boolean) => void
  contextFileName: string | null
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
      pendingApprovals={props.pendingApprovals}
      onApprovalDecide={props.onApprovalDecide}
      pricingOverrides={props.pricingOverrides}
      followLatest={props.followLatest}
      onSetFollowLatest={props.onSetFollowLatest}
      contextFileName={props.contextFileName}
    />
  )
}
