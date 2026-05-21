import { useMcpServerStatus, type Status } from './useMcpServerStatus'

interface Props {
  item: unknown
  idx: number
  helpers: {
    isExpanded: boolean
    onCollapsed: (cb: () => void) => () => void
  }
}

/**
 * Per-row MCP affordances: a status dot in the collapsed header slot and a
 * result panel (tool list / error / Retry button) in the expanded panel slot.
 *
 * The parent `ArrayOfObjectsControl` renders this whole node TWICE per row —
 * once next to the row's up/down/× buttons (the collapsed slot) and once
 * inside the expanded panel (below the auto-gen form). The two renders read
 * the same `helpers.isExpanded`, so the dot shows only when collapsed and
 * the panel shows only when expanded — the two halves are positionally
 * disjoint by virtue of the `isExpanded` gating + CSS layout.
 */
export function MCPRowExtras({ item, helpers }: Props) {
  const { status, retry } = useMcpServerStatus(item, helpers.onCollapsed)
  const { isExpanded } = helpers

  return (
    <>
      <span
        data-role="mcp-row-status-dot"
        title={statusTooltip(status)}
        aria-label={statusAriaLabel(status)}
        className={`inline-block w-2 h-2 rounded-full shrink-0 ${dotColor(status)} ${isExpanded ? 'hidden' : ''}`}
      />
      {isExpanded && (
        <div data-role="mcp-row-status-panel" className="text-xs">
          {status.kind === 'idle' && (
            <span className="text-muted italic">
              Not tested yet. Fill in name + command/url and collapse the row to test.
            </span>
          )}
          {status.kind === 'testing' && <span className="text-muted">Testing…</span>}
          {status.kind === 'connected' && (
            <div className="flex flex-col gap-1">
              <div className="text-emerald-500">
                ✓ Connected · {status.tools.length} tool{status.tools.length === 1 ? '' : 's'}
              </div>
              {status.tools.length > 0 && (
                <ul className="ml-4 list-disc text-muted">
                  {status.tools.map((t) => (
                    <li key={t.name}>
                      <span className="font-mono">{t.name}</span>
                      {t.description ? <span className="text-subtle"> — {t.description}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => { void retry() }}
                className="btn-secondary text-xs self-start"
              >
                Retry
              </button>
            </div>
          )}
          {status.kind === 'failed' && (
            <div className="flex flex-col gap-1">
              <div className="text-red-500">✗ Connection failed</div>
              <pre className="bg-panel/60 p-1 rounded text-[11px] whitespace-pre-wrap break-words">
                {status.error}
              </pre>
              <button
                type="button"
                onClick={() => { void retry() }}
                className="btn-secondary text-xs self-start"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function statusTooltip(s: Status): string {
  switch (s.kind) {
    case 'idle': return 'Not tested yet'
    case 'testing': return 'Testing…'
    case 'connected': return `Connected · ${s.tools.length} tool${s.tools.length === 1 ? '' : 's'}`
    case 'failed': return `Failed: ${s.error}`
  }
}

function statusAriaLabel(s: Status): string {
  return `Status: ${s.kind === 'connected' ? `connected, ${s.tools.length} tools` : s.kind}`
}

function dotColor(s: Status): string {
  switch (s.kind) {
    case 'connected': return 'bg-emerald-500'
    case 'failed': return 'bg-red-500'
    case 'testing': return 'bg-amber-400 animate-pulse'
    case 'idle': return 'bg-zinc-500'
  }
}
