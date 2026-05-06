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
}

export function ChatApprovalCard({ preview, state, onDecide }: ChatApprovalCardProps) {
  const tone = state === 'denied' || state === 'cancelled'
    ? 'border-stone-300 bg-stone-50 dark:border-neutral-700 dark:bg-neutral-900'
    : state === 'approved'
      ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700/60 dark:bg-emerald-950/40'
      : 'border-amber-300 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-950/40'
  return (
    <div className={`my-2 rounded-md border px-3 py-2 text-sm ${tone}`}>
      <div className="font-medium">{HEADERS[preview.kind](preview)}</div>
      {preview.kind === 'create' && preview.contentPreview && (
        <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-white/60 p-2 text-xs dark:bg-black/30">{preview.contentPreview}</pre>
      )}
      {preview.kind === 'edit' && preview.diff && (
        <DiffView before={preview.diff.before} after={preview.diff.after} />
      )}
      {state === 'pending' ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="btn-primary text-xs" onClick={() => onDecide('approve')}>Approve</button>
          <button type="button" className="btn-secondary text-xs" onClick={() => onDecide('deny')}>Deny</button>
          <button type="button" className="btn-ghost text-xs" onClick={() => onDecide('approve-rest')}>Approve rest of turn</button>
        </div>
      ) : (
        <div className="mt-1 text-xs text-stone-600 dark:text-neutral-400">
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
    <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-white/60 p-2 text-xs dark:bg-black/30">
      {parts.map((p, i) => (
        <span
          key={i}
          className={
            p.added ? 'bg-emerald-100 dark:bg-emerald-900/30'
            : p.removed ? 'bg-red-100 line-through dark:bg-red-900/30'
            : ''
          }
        >
          {p.value}
        </span>
      ))}
    </pre>
  )
}
