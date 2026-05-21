import type { Status, useMcpServerStatus } from './useMcpServerStatus'

interface Props {
  state: ReturnType<typeof useMcpServerStatus>
  isExpanded: boolean
}

/**
 * Row-header slot for an MCP server row: a small status dot with a tooltip.
 * Hidden when the row is expanded (the panel shows the verbose status there).
 *
 * The shared per-row state comes from `ArrayOfObjectsControl`'s RowExtrasContext
 * — see `useMcpServerStatus` for the underlying hook.
 */
export function MCPRowExtrasHeader({ state, isExpanded }: Props) {
  const { status } = state
  return (
    <span
      data-role="mcp-row-status-dot"
      title={statusTooltip(status)}
      aria-label={statusAriaLabel(status)}
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${dotColor(status)} ${isExpanded ? 'hidden' : ''}`}
    />
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
