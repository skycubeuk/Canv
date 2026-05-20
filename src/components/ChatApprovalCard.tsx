import { computeDiff } from '../lib/diff'
import type { WritePreview, ApprovalDecision } from '../agents/chatRunner'

export type ApprovalState = 'pending' | 'approved' | 'denied' | 'cancelled'

export interface ChatApprovalCardProps {
  preview: WritePreview
  state: ApprovalState
  onDecide: (d: ApprovalDecision) => void
}

const HEADERS: Record<WritePreview['kind'], (p: WritePreview) => string> = {
  create: (p) => `Create ${p.path}`,
  edit: (p) => `Edit ${p.path}`,
  delete: (p) => `Delete ${p.path}`,
  rename: (p) => `Rename ${p.path} → ${p.newPath ?? '?'}`,
  mkdir: (p) => `Create folder ${p.path}`,
  mcp: (p) => `Call MCP tool ${p.path}`,
}

export function ChatApprovalCard({ preview, state, onDecide }: ChatApprovalCardProps) {
  const tone = state === 'denied' || state === 'cancelled'
    ? 'border-default bg-panel'
    : state === 'approved'
      ? 'border-emerald-700/60 bg-emerald-950/40'
      : 'border-amber-700/60 bg-amber-950/40'
  const mcpServer = preview.kind === 'mcp' && preview.path.includes('::')
    ? preview.path.slice(0, preview.path.indexOf('::'))
    : null
  const mcpToolLabel = preview.kind === 'mcp' && preview.path.includes('::')
    ? preview.path.slice(preview.path.indexOf('::') + 2)
    : preview.path
  return (
    <div className={`my-2 rounded-md border px-3 py-2 text-[1em] ${tone}`}>
      <div className="flex items-center gap-2 font-medium">
        {preview.kind === 'mcp' && (
          <span className="rounded-sm border border-default bg-panel/60 px-1.5 py-0.5 text-[0.7em] font-semibold uppercase tracking-wide text-muted">
            MCP
          </span>
        )}
        <span>
          {preview.kind === 'mcp'
            ? `Call MCP tool ${mcpToolLabel}`
            : HEADERS[preview.kind](preview)}
        </span>
      </div>
      {mcpServer && (
        <div className="mt-0.5 text-[0.8em] text-muted">server: {mcpServer}</div>
      )}
      {preview.kind === 'create' && preview.contentPreview && (
        <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-sm bg-panel/60 p-2 text-[0.85em]">{preview.contentPreview}</pre>
      )}
      {preview.kind === 'mcp' && preview.contentPreview && (
        <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-sm bg-panel/60 p-2 text-[0.85em]">{preview.contentPreview}</pre>
      )}
      {preview.kind === 'edit' && preview.diff && (
        <DiffView before={preview.diff.before} after={preview.diff.after} />
      )}
      {state === 'pending' ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="btn-primary text-[0.85em]" onClick={() => onDecide('approve')}>Approve</button>
          <button type="button" className="btn-secondary text-[0.85em]" onClick={() => onDecide('deny')}>Deny</button>
          <button type="button" className="btn-ghost text-[0.85em]" onClick={() => onDecide('approve-rest')}>Approve rest of turn</button>
        </div>
      ) : (
        <div className="mt-1 text-[0.85em] text-muted">
          {state === 'approved' && '✓ approved'}
          {state === 'denied' && '✗ denied'}
          {state === 'cancelled' && '— cancelled'}
        </div>
      )}
    </div>
  )
}

function DiffView({ before, after }: { before: string; after: string }) {
  const parts = computeDiff(before, after)
  return (
    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded-sm bg-panel/60 p-2 text-[0.85em]">
      {parts.map((p, i) => (
        <span
          key={i}
          className={
            p.added ? 'bg-emerald-900/30'
            : p.removed ? 'bg-red-900/30 line-through'
            : ''
          }
        >
          {p.value}
        </span>
      ))}
    </pre>
  )
}
