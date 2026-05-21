import type { useMcpServerStatus } from './useMcpServerStatus'

interface Props {
  state: ReturnType<typeof useMcpServerStatus>
}

/**
 * Expanded-panel slot for an MCP server row: tool list on success, error
 * detail on failure, and a Retry button. Shares state with the header dot
 * via `ArrayOfObjectsControl`'s RowExtrasContext.
 */
export function MCPRowExtrasPanel({ state }: Props) {
  const { status, retry } = state
  return (
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
  )
}
