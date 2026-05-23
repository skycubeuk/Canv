import { useEffect, useMemo, useRef, useState } from 'react'
import { getFs, isElectron } from '../../../lib/fs'
import type { SearchMatch, SearchResult } from '../../../lib/searchTypes'
import { SidebarSectionTitle, SidebarRow, SidebarMeta, SidebarEmpty } from './SidebarChrome'

interface Props {
  onJumpToMatch: (
    match: SearchMatch,
    query: { query: string; regex: boolean; caseSensitive: boolean },
    /** 0-based index of this match within its file's results, so the editor jumps to the Nth match (not always the 1st). */
    ordinalInFile: number,
  ) => void
}

interface UiState {
  query: string
  regex: boolean
  caseSensitive: boolean
  folder: string
}

const DEFAULT_UI: UiState = { query: '', regex: false, caseSensitive: false, folder: '' }
const DEBOUNCE_MS = 300

function isValidRegex(pattern: string): boolean {
  try { new RegExp(pattern); return true } catch { return false }
}

export function SearchTab({ onJumpToMatch }: Props) {
  const [ui, setUi] = useState<UiState>(DEFAULT_UI)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [busy, setBusy] = useState(false)
  const tokenRef = useRef(0)

  // Debounced search. result/busy are externally-driven (IPC + UI lifecycle)
  // and not derivable from prior state; resetting them when the query changes
  // is the whole point of this effect. The stale-token guard on tokenRef
  // prevents cascading renders from outdated in-flight searches.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isElectron()) return
    if (!ui.query) {
      setResult(null)
      setBusy(false)
      return
    }
    if (ui.regex && !isValidRegex(ui.query)) {
      setResult({ matches: [], truncated: false })
      setBusy(false)
      return
    }
    const myToken = ++tokenRef.current
    setBusy(true)
    const t = setTimeout(async () => {
      try {
        const r = await getFs().search({
          query: ui.query,
          regex: ui.regex,
          caseSensitive: ui.caseSensitive,
          folder: ui.folder || undefined,
        })
        // Stale-token guard: drop the result if a newer query started.
        if (myToken !== tokenRef.current) return
        setResult(r)
      } catch {
        if (myToken !== tokenRef.current) return
        setResult({ matches: [], truncated: false })
      } finally {
        if (myToken === tokenRef.current) setBusy(false)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [ui.query, ui.regex, ui.caseSensitive, ui.folder])
  /* eslint-enable react-hooks/set-state-in-effect */

  const grouped = useMemo(() => groupByRel(result?.matches ?? []), [result])
  const regexInvalid = ui.regex && ui.query.length > 0 && !isValidRegex(ui.query)

  return (
    <div className="h-full flex flex-col bg-panel">
      <div className="shrink-0 px-3 py-2 space-y-2 border-b border-default">
        <div className="flex items-stretch gap-1">
          <input
            type="search"
            placeholder="Search…"
            value={ui.query}
            onChange={(e) => setUi((s) => ({ ...s, query: e.target.value }))}
            className="input flex-1 text-sm"
            aria-label="Search query"
          />
          <button
            type="button"
            aria-pressed={ui.regex}
            onClick={() => setUi((s) => ({ ...s, regex: !s.regex }))}
            title="Use regular expression"
            className={`btn-icon px-2 text-xs ${ui.regex ? 'bg-active text-default' : ''}`}
          >.*</button>
          <button
            type="button"
            aria-pressed={ui.caseSensitive}
            onClick={() => setUi((s) => ({ ...s, caseSensitive: !s.caseSensitive }))}
            title="Match case"
            className={`btn-icon px-2 text-xs ${ui.caseSensitive ? 'bg-active text-default' : ''}`}
          >Aa</button>
        </div>
        <input
          type="search"
          placeholder="Folder (optional, e.g. notes/)"
          value={ui.folder}
          onChange={(e) => setUi((s) => ({ ...s, folder: e.target.value }))}
          className="input w-full text-xs"
          aria-label="Folder scope"
        />
        {regexInvalid && (
          <p className="text-xs text-danger-fg">Invalid regular expression.</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {!ui.query && (
          <SidebarEmpty>Type to search markdown files.</SidebarEmpty>
        )}
        {ui.query && busy && (
          <SidebarEmpty>Searching…</SidebarEmpty>
        )}
        {ui.query && !busy && result && result.matches.length === 0 && (
          <SidebarEmpty>No matches.</SidebarEmpty>
        )}
        {result && result.matches.length > 0 && (
          <ul role="list">
            {grouped.map(([rel, matches]) => (
              <li key={rel}>
                <div className="sticky top-0 bg-panel border-b border-default">
                  <SidebarSectionTitle>
                    <span className="truncate inline-block max-w-full">
                      {rel} <span className="opacity-70">({matches.length})</span>
                    </span>
                  </SidebarSectionTitle>
                </div>
                {matches.map((m, i) => (
                  <SidebarRow
                    key={`${rel}:${m.line}:${m.col}:${i}`}
                    onClick={() => onJumpToMatch(m, { query: ui.query, regex: ui.regex, caseSensitive: ui.caseSensitive }, i)}
                    title={`Line ${m.line + 1}, column ${m.col + 1}`}
                  >
                    <SidebarMeta>{m.line + 1}:{m.col + 1}</SidebarMeta>
                    <span className="flex-1 min-w-0 truncate"><Snippet match={m} /></span>
                  </SidebarRow>
                ))}
              </li>
            ))}
          </ul>
        )}
        {result?.truncated && (
          <p className="px-3 py-2 text-warning-fg">
            Showing the first 1,000 matches. Narrow your search to see more.
          </p>
        )}
      </div>
    </div>
  )
}

function Snippet({ match }: { match: SearchMatch }) {
  // `snippetCol` is pre-computed by the main process so highlighting works
  // for both short lines (snippetCol === col) and trimmed long lines
  // (snippetCol < col, pointing into the sliced window).
  const idx = match.snippetCol
  if (idx < 0 || idx + match.matchLen > match.snippet.length) {
    return <span className="font-mono">{match.snippet}</span>
  }
  const before = match.snippet.slice(0, idx)
  const hit = match.snippet.slice(idx, idx + match.matchLen)
  const after = match.snippet.slice(idx + match.matchLen)
  return (
    <span className="font-mono">
      {before}<span className="font-bold text-default bg-warning-soft">{hit}</span>{after}
    </span>
  )
}

function groupByRel(matches: SearchMatch[]): [string, SearchMatch[]][] {
  const map = new Map<string, SearchMatch[]>()
  for (const m of matches) {
    const list = map.get(m.rel)
    if (list) list.push(m)
    else map.set(m.rel, [m])
  }
  return Array.from(map.entries())
}
