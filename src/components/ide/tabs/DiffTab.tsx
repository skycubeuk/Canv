import { useCallback, useEffect, useRef, useState } from 'react'
import { diffLines, type Change } from 'diff'
import { getFs, isElectron } from '../../../lib/fs'
import type { GitDiffPayload } from '../../../lib/gitTypes'

interface Props {
  relPath: string
  baseRef: string
  isActive: boolean
}

type ViewMode = 'side-by-side' | 'inline'

interface DiffState {
  payload: GitDiffPayload | null
  loading: boolean
  error: string | null
}

export function DiffTab({ relPath, baseRef, isActive }: Props) {
  const [state, setState] = useState<DiffState>({ payload: null, loading: false, error: null })
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side')
  const fetchCount = useRef(0)

  const fetchDiff = useCallback(async () => {
    if (!isElectron()) return
    const token = ++fetchCount.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const payload = await getFs().gitDiff(relPath, baseRef)
      if (token !== fetchCount.current) return
      setState({ payload, loading: false, error: null })
    } catch (err) {
      if (token !== fetchCount.current) return
      setState({ payload: null, loading: false, error: err instanceof Error ? err.message : String(err) })
    }
  }, [relPath, baseRef])

  // Fetch on mount and whenever the tab becomes active. fetchDiff is the
  // sole consumer of the IPC; the setState happens inside its async path.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isActive) fetchDiff()
  }, [isActive, fetchDiff])
  /* eslint-enable react-hooks/set-state-in-effect */

  const changes: Change[] = state.payload
    ? diffLines(state.payload.baseText, state.payload.currentText)
    : []

  return (
    <div className="h-full flex flex-col bg-stone-50 dark:bg-neutral-950 text-xs font-mono overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-stone-200 dark:border-neutral-800 bg-stone-100 dark:bg-neutral-900 text-[11px]">
        <span className="text-stone-500 dark:text-neutral-400 select-none">
          {relPath} vs {baseRef}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setViewMode((m) => m === 'side-by-side' ? 'inline' : 'side-by-side')}
          className="px-2 py-0.5 rounded border border-stone-300 dark:border-neutral-700 text-stone-600 dark:text-neutral-400 hover:bg-stone-200 dark:hover:bg-neutral-800"
          title="Toggle diff view mode"
        >
          {viewMode === 'side-by-side' ? 'Inline' : 'Side-by-side'}
        </button>
        <button
          type="button"
          onClick={fetchDiff}
          disabled={state.loading}
          className="px-2 py-0.5 rounded border border-stone-300 dark:border-neutral-700 text-stone-600 dark:text-neutral-400 hover:bg-stone-200 dark:hover:bg-neutral-800 disabled:opacity-50"
          title="Refresh diff"
        >
          {state.loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {state.loading && !state.payload && (
          <p className="px-4 py-3 text-stone-500 dark:text-neutral-400">Loading diff…</p>
        )}
        {state.error && (
          <p className="px-4 py-3 text-red-600 dark:text-red-400">Error: {state.error}</p>
        )}
        {!state.loading && !state.error && state.payload && changes.length === 0 && (
          <p className="px-4 py-3 text-stone-500 dark:text-neutral-400">No differences.</p>
        )}
        {state.payload && changes.length > 0 && viewMode === 'inline' && (
          <InlineDiff changes={changes} />
        )}
        {state.payload && changes.length > 0 && viewMode === 'side-by-side' && (
          <SideBySideDiff changes={changes} />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline renderer
// ---------------------------------------------------------------------------

function InlineDiff({ changes }: { changes: Change[] }) {
  return (
    <table className="w-full border-collapse text-[11px]">
      <tbody>
        {changes.map((change, ci) => {
          const lines = splitLines(change.value)
          const bg = change.added
            ? 'bg-green-50 dark:bg-green-950/40 text-green-900 dark:text-green-300'
            : change.removed
              ? 'bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-300 line-through opacity-70'
              : 'text-stone-700 dark:text-neutral-300'
          const marker = change.added ? '+' : change.removed ? '-' : ' '
          return lines.map((line, li) => (
            <tr key={`${ci}-${li}`} className={bg}>
              <td className="w-6 select-none text-center text-stone-400 dark:text-neutral-600 border-r border-stone-200 dark:border-neutral-800 pr-1">
                {marker}
              </td>
              <td className="pl-3 pr-4 py-px whitespace-pre-wrap break-all">{line}</td>
            </tr>
          ))
        })}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Side-by-side renderer
// ---------------------------------------------------------------------------

interface SbsRow {
  left: string | null   // null = blank/no-content on this side
  right: string | null
  kind: 'context' | 'added' | 'removed' | 'changed'
}

function buildSbsRows(changes: Change[]): SbsRow[] {
  const rows: SbsRow[] = []
  let i = 0
  while (i < changes.length) {
    const c = changes[i]
    if (!c.added && !c.removed) {
      // Context lines
      for (const line of splitLines(c.value)) {
        rows.push({ left: line, right: line, kind: 'context' })
      }
      i++
      continue
    }
    if (c.removed && i + 1 < changes.length && changes[i + 1].added) {
      // Paired remove+add: zip them side-by-side.
      const removedLines = splitLines(c.value)
      const addedLines = splitLines(changes[i + 1].value)
      const len = Math.max(removedLines.length, addedLines.length)
      for (let j = 0; j < len; j++) {
        rows.push({
          left: removedLines[j] ?? null,
          right: addedLines[j] ?? null,
          kind: 'changed',
        })
      }
      i += 2
      continue
    }
    if (c.removed) {
      for (const line of splitLines(c.value)) {
        rows.push({ left: line, right: null, kind: 'removed' })
      }
      i++
      continue
    }
    // added
    for (const line of splitLines(c.value)) {
      rows.push({ left: null, right: line, kind: 'added' })
    }
    i++
  }
  return rows
}

function SideBySideDiff({ changes }: { changes: Change[] }) {
  const rows = buildSbsRows(changes)
  return (
    <table className="w-full border-collapse text-[11px]" style={{ tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: '50%' }} />
        <col style={{ width: '50%' }} />
      </colgroup>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri}>
            <td
              className={`pl-3 pr-2 py-px whitespace-pre-wrap break-all border-r border-stone-200 dark:border-neutral-800 align-top ${
                row.kind === 'removed' || row.kind === 'changed'
                  ? 'bg-red-50 dark:bg-red-950/40 text-red-900 dark:text-red-300'
                  : 'text-stone-700 dark:text-neutral-300'
              }`}
            >
              {row.left ?? ''}
            </td>
            <td
              className={`pl-3 pr-2 py-px whitespace-pre-wrap break-all align-top ${
                row.kind === 'added' || row.kind === 'changed'
                  ? 'bg-green-50 dark:bg-green-950/40 text-green-900 dark:text-green-300'
                  : 'text-stone-700 dark:text-neutral-300'
              }`}
            >
              {row.right ?? ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Split a Change value into individual display lines, trimming the trailing empty string that
 *  results from a trailing newline. */
function splitLines(value: string): string[] {
  const lines = value.split('\n')
  // diffLines always ends a hunk with '\n'; remove the empty last element.
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}
