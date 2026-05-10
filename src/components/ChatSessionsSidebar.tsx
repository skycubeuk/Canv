import { Plus, X, Loader2 } from 'lucide-react'

export interface SidebarSession {
  id: string
  title: string
  busy: boolean
  pendingApprovalCount: number
}

interface Props {
  sessions: SidebarSession[]
  activeId: string
  onCreate: () => void
  onSelect: (id: string) => void
  onClose: (id: string) => void
}

export function ChatSessionsSidebar({ sessions, activeId, onCreate, onSelect, onClose }: Props) {
  return (
    <div className="w-56 shrink-0 border-r border-default flex flex-col min-h-0">
      <button
        type="button"
        onClick={onCreate}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted hover:bg-hover hover:text-default border-b border-default"
      >
        <Plus aria-hidden className="w-4 h-4" />
        <span className="font-medium">New chat</span>
      </button>
      <div className="flex-1 overflow-y-auto py-1">
        {sessions.map((s) => {
          const isActive = s.id === activeId
          return (
            <div
              key={s.id}
              data-active={isActive ? 'true' : 'false'}
              className={`group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-xs ${
                isActive ? 'bg-active text-default' : 'text-muted hover:bg-hover'
              }`}
              onClick={() => onSelect(s.id)}
            >
              <span className="font-medium truncate flex-1">{s.title}</span>
              {s.busy && (
                <Loader2
                  data-testid={`session-busy-${s.id}`}
                  aria-hidden
                  className="w-3 h-3 animate-spin"
                />
              )}
              {s.pendingApprovalCount > 0 && (
                <span
                  data-testid={`session-approvals-${s.id}`}
                  className="ml-1 px-1 rounded bg-accent-soft text-accent text-[10px] font-mono"
                  aria-label={`${s.pendingApprovalCount} pending approvals`}
                >
                  {s.pendingApprovalCount}
                </span>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClose(s.id) }}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 ml-1"
                aria-label={`Close ${s.title}`}
              >
                <X aria-hidden className="w-3 h-3" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
