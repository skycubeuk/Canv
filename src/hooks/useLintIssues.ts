import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lintMarkdown } from '../lib/lint'
import type { LintIssue, LintOptions, WorkspaceFiles } from '../lib/lintTypes'
import { getFs, isElectron, flattenTree, type DirNode } from '../lib/fs'

export type ScanState = 'idle' | 'scanning' | 'done' | 'error'

export interface UseLintIssuesApi {
  /** Open-tab issues (live) merged with the most-recent workspace scan results. */
  issues: LintIssue[]
  scanState: ScanState
  scanError: string | null
  /** Trigger a workspace-wide scan. Resolves when scanning is complete. */
  scanWorkspace: () => Promise<void>
  /** Clear workspace scan results (open-tab issues remain). */
  clearWorkspaceIssues: () => void
}

export interface OpenTabSource {
  rel: string
  /** Markdown source. Caller converts editor HTML via htmlToMarkdown if needed. */
  md: string
}

/** Pure helper exported for unit testing. */
export function computeOpenTabIssues(
  tabs: OpenTabSource[],
  files: WorkspaceFiles,
  opts: LintOptions,
): LintIssue[] {
  const out: LintIssue[] = []
  for (const t of tabs) out.push(...lintMarkdown(t.md, t.rel, files, opts))
  return out
}

interface Args {
  /** Markdown sources for currently-open tabs. Stable references preferred. */
  openSources: OpenTabSource[]
  /** Workspace tree (for the file-set used by link/image checks and the scan). */
  tree: DirNode | null
  opts: LintOptions
  /** Debounce window for open-tab re-lints. Default 300ms. */
  debounceMs?: number
}

/** Derive the set of relative paths covered by open editor tabs. */
export function openRelsFromSources(sources: OpenTabSource[]): Set<string> {
  return new Set(sources.map((t) => t.rel))
}

export function useLintIssues({
  openSources,
  tree,
  opts,
  debounceMs = 300,
}: Args): UseLintIssuesApi {
  const files: WorkspaceFiles = useMemo(() => {
    const set = new Set<string>()
    if (tree) for (const e of flattenTree(tree)) if (e.kind === 'file') set.add(e.relPath)
    return set
  }, [tree])

  // Issue #1 fix: derive openRels from openSources (not openIssues), so files
  // open in an editor tab are always excluded from workspace scan results even
  // when the tab currently has zero lint issues.
  const openRels = useMemo(() => openRelsFromSources(openSources), [openSources])

  const [openIssues, setOpenIssues] = useState<LintIssue[]>([])
  const [workspaceIssues, setWorkspaceIssues] = useState<LintIssue[]>([])
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [scanError, setScanError] = useState<string | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scanToken = useRef(0)

  // Issue #2 fix: stash latest inputs in a ref so scanWorkspace has a stable
  // identity (deps=[]) and consumers can safely memoize against it.
  const latestRef = useRef({ tree, openRels, files, opts })
  useEffect(() => {
    latestRef.current = { tree, openRels, files, opts }
  })

  // Recompute open-tab issues debounced. setOpenIssues is the only consumer
  // of the debounced result; the timer guards against rapid edits flooding
  // the lint engine.
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null
      setOpenIssues(computeOpenTabIssues(openSources, files, opts))
    }, debounceMs)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [openSources, files, opts, debounceMs])

  const scanWorkspace = useCallback(async () => {
    const { tree: t, openRels: rels, files: f, opts: o } = latestRef.current
    if (!isElectron() || !t) return
    const myToken = ++scanToken.current
    setScanState('scanning')
    setScanError(null)
    try {
      const allMd = flattenTree(t).filter(
        (e) => e.kind === 'file' && /\.(md|markdown)$/i.test(e.relPath),
      )
      const issuesOut: LintIssue[] = []
      for (const entry of allMd) {
        if (myToken !== scanToken.current) return
        // Skip files already covered by open-tab issues — those use editor
        // content (fresher than disk).
        if (rels.has(entry.relPath)) continue
        try {
          const { content } = await getFs().readFile(entry.relPath)
          issuesOut.push(...lintMarkdown(content, entry.relPath, f, o))
        } catch {
          // skip unreadable file
        }
      }
      if (myToken !== scanToken.current) return
      setWorkspaceIssues(issuesOut)
      setScanState('done')
    } catch (err) {
      if (myToken !== scanToken.current) return
      setScanError(err instanceof Error ? err.message : String(err))
      setScanState('error')
    }
  }, [])

  const clearWorkspaceIssues = useCallback(() => {
    setWorkspaceIssues([])
    setScanState('idle')
    // Issue #3 fix: also clear scanError so stale error messages don't linger.
    setScanError(null)
  }, [])

  // Merge: open-tab files take priority over workspace scan results for the
  // same rel (using openRels derived from openSources, not openIssues, so a
  // tab with zero issues still suppresses stale workspace results for that file).
  const issues = useMemo(() => {
    const filtered = workspaceIssues.filter((i) => !openRels.has(i.rel))
    const merged = [...openIssues, ...filtered]
    merged.sort((a, b) => a.rel.localeCompare(b.rel) || a.line - b.line)
    return merged
  }, [openIssues, workspaceIssues, openRels])

  return { issues, scanState, scanError, scanWorkspace, clearWorkspaceIssues }
}

/** Convenience helper: turn a markdown snapshot into an OpenTabSource. */
export function tabSourceFromMarkdown(rel: string, md: string): OpenTabSource {
  return { rel, md }
}
