import { useCallback, useEffect, useRef, useState } from 'react'
import { GitBranch } from 'lucide-react'
import { getFs, isElectron } from '../../../lib/fs'
import type { GitStatusPayload, GitStatusEntry, GitFileStatus } from '../../../lib/gitTypes'

const DEBOUNCE_MS = 1000

interface Props {
  /** Called when the user clicks a file row; parent opens a DiffTab. */
  onOpenDiff: (relPath: string, baseRef: string) => void
}

interface FetchState {
  payload: (GitStatusPayload & { noRepo?: boolean }) | null
  loading: boolean
  error: string | null
}

const STATUS_BADGE: Record<GitFileStatus, { label: string; className: string }> = {
  modified:  { label: 'M', className: 'bg-amber-800/60 text-amber-300' },
  deleted:   { label: 'D', className: 'bg-red-800/60 text-red-300' },
  renamed:   { label: 'R', className: 'bg-blue-800/60 text-blue-300' },
  added:     { label: 'A', className: 'bg-green-800/60 text-green-300' },
  untracked: { label: 'U', className: 'bg-active text-default' },
}

export function GitTab({ onOpenDiff }: Props) {
  const [state, setState] = useState<FetchState>({ payload: null, loading: false, error: null })
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetchCount = useRef(0)

  const fetchStatus = useCallback(async () => {
    if (!isElectron()) return
    const token = ++fetchCount.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const payload = await getFs().gitStatus()
      if (token !== fetchCount.current) return
      setState({ payload, loading: false, error: null })
    } catch (err) {
      if (token !== fetchCount.current) return
      setState({
        payload: null,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }, [])

  // Fetch on mount. fetchStatus is the only consumer of the IPC; setState
  // happens inside its async callbacks so the rule fires on the call-site.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Auto-refresh: debounce 1 s after any fs event.
  useEffect(() => {
    if (!isElectron()) return
    const unsub = getFs().subscribe(() => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => {
        debounceTimer.current = null
        fetchStatus()
      }, DEBOUNCE_MS)
    })
    return () => {
      unsub()
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [fetchStatus])

  const { payload, loading, error } = state

  if (payload?.noRepo) {
    return (
      <div className="h-full flex items-center justify-center text-center px-6 text-sm text-muted bg-panel">
        <p>This workspace isn&apos;t a Git repository.</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-panel text-xs overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-default">
        <GitBranch aria-hidden className="w-3 h-3 text-muted" />
        <span className="font-medium text-default truncate flex-1">
          {payload?.branch ?? (loading ? 'Loading…' : 'unknown')}
        </span>
        <button
          type="button"
          onClick={fetchStatus}
          disabled={loading}
          title="Refresh Git status"
          className="px-2 py-0.5 rounded-sm text-muted hover:bg-hover disabled:opacity-50"
        >
          {loading ? '…' : '⟳'}
        </button>
      </div>

      {error && (
        <p className="px-3 py-2 text-red-400">Error: {error}</p>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        {payload && (
          <>
            <Section
              title="Changed"
              entries={payload.changed}
              onOpenDiff={onOpenDiff}
            />
            <Section
              title="Staged"
              entries={payload.staged}
              onOpenDiff={onOpenDiff}
            />
            <Section
              title="Untracked"
              entries={payload.untracked}
              onOpenDiff={onOpenDiff}
            />
            {payload.changed.length === 0 &&
              payload.staged.length === 0 &&
              payload.untracked.length === 0 && (
              <p className="px-3 py-3 text-muted">
                No changes — working tree clean.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Section({
  title,
  entries,
  onOpenDiff,
}: {
  title: string
  entries: GitStatusEntry[]
  onOpenDiff: (relPath: string, baseRef: string) => void
}) {
  if (entries.length === 0) return null
  return (
    <div className="mb-1">
      <div className="px-3 py-1 text-[11px] font-semibold text-muted uppercase tracking-wide">
        {title} ({entries.length})
      </div>
      {entries.map((entry) => {
        const badge = STATUS_BADGE[entry.status]
        const name = basename(entry.relPath)
        return (
          <button
            key={entry.relPath}
            type="button"
            onClick={() => onOpenDiff(entry.relPath, 'HEAD')}
            title={entry.relPath}
            className="w-full flex items-center gap-2 px-3 py-1 text-left hover:bg-hover group"
          >
            <span
              className={`shrink-0 w-4 h-4 inline-flex items-center justify-center rounded-sm text-[10px] font-bold ${badge.className}`}
              aria-label={`Status: ${entry.status}`}
            >
              {badge.label}
            </span>
            <span className="truncate text-default">{name}</span>
            <span className="truncate text-subtle text-[10px] ml-auto">
              {dirpart(entry.relPath)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function basename(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i >= 0 ? rel.slice(i + 1) : rel
}

function dirpart(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i >= 0 ? rel.slice(0, i) : ''
}
