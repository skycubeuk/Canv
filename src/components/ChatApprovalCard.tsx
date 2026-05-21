import { computeDiff } from '../lib/diff'
import type { WritePreview, ApprovalDecision } from '../agents/chatRunner'

export type ApprovalState = 'pending' | 'approved' | 'denied' | 'cancelled'

export interface ChatApprovalCardProps {
  preview: WritePreview
  state: ApprovalState
  onDecide: (d: ApprovalDecision) => void
}

// Single-path mutating variants — headers are derived from `preview.path`
// (and `newPath` for rename). MCP previews use an inline ternary below
// (server + tool name split). The `apply_edits` variant has its own block
// because it's a multi-edit multi-file shape.
type PathKind = 'create' | 'edit' | 'delete' | 'rename' | 'mkdir'
const PATH_HEADERS: Record<PathKind, (path: string, newPath?: string) => string> = {
  create: (p) => `Create ${p}`,
  edit: (p) => `Edit ${p}`,
  delete: (p) => `Delete ${p}`,
  rename: (p, np) => `Rename ${p} → ${np ?? '?'}`,
  mkdir: (p) => `Create folder ${p}`,
}

export function ChatApprovalCard({ preview, state, onDecide }: ChatApprovalCardProps) {
  const tone = state === 'denied' || state === 'cancelled'
    ? 'border-default bg-panel'
    : state === 'approved'
      ? 'border-emerald-700/60 bg-emerald-950/40'
      : 'border-amber-700/60 bg-amber-950/40'

  let header: React.ReactNode = null
  let mcpServer: string | null = null

  if (preview.kind === 'apply_edits') {
    const fileCount = new Set(preview.edits.map((e) => e.path)).size
    header = (
      <span>
        Apply {preview.edits.length} edit{preview.edits.length === 1 ? '' : 's'} across{' '}
        {fileCount} file{fileCount === 1 ? '' : 's'}
      </span>
    )
  } else if (preview.kind === 'mcp') {
    mcpServer = preview.path.includes('__')
      ? preview.path.slice(0, preview.path.indexOf('__'))
      : null
    const mcpToolLabel = preview.path.includes('__')
      ? preview.path.slice(preview.path.indexOf('__') + 2)
      : preview.path
    header = (
      <>
        <span className="rounded-sm border border-default bg-panel/60 px-1.5 py-0.5 text-[0.7em] font-semibold uppercase tracking-wide text-muted">
          MCP
        </span>
        <span>Call MCP tool {mcpToolLabel}</span>
      </>
    )
  } else {
    header = <span>{PATH_HEADERS[preview.kind](preview.path, preview.newPath)}</span>
  }

  return (
    <div className={`my-2 rounded-md border px-3 py-2 text-[1em] ${tone}`}>
      <div className="flex items-center gap-2 font-medium">
        {header}
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
      {preview.kind === 'apply_edits' && (
        <ul className="mt-1 flex max-h-72 flex-col gap-2 overflow-auto">
          {preview.edits.map((e, idx) => (
            <li key={idx} className="rounded-sm border border-default bg-panel/60 p-2">
              <div className="font-mono text-[0.8em] text-muted">{e.path}</div>
              <pre className="mt-1 whitespace-pre-wrap rounded-sm bg-red-900/30 px-1.5 py-1 text-[0.85em] line-through">{e.oldText}</pre>
              <pre className="mt-1 whitespace-pre-wrap rounded-sm bg-emerald-900/30 px-1.5 py-1 text-[0.85em]">{e.newText}</pre>
            </li>
          ))}
        </ul>
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
