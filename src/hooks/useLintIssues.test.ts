import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { computeOpenTabIssues, openRelsFromSources } from './useLintIssues'
import { useLintIssues } from './useLintIssues'
import { DEFAULT_LINT_OPTIONS } from '../lib/lintTypes'
import type { DirNode } from '../lib/fs'

describe('computeOpenTabIssues', () => {
  it('returns an empty array when no tabs are open', () => {
    expect(computeOpenTabIssues([], new Set(), DEFAULT_LINT_OPTIONS)).toEqual([])
  })

  it('lints each markdown source and concatenates', () => {
    const tabs = [
      { rel: 'a.md', md: '# A\n### B' },     // heading-skip
      { rel: 'b.md', md: '[x](missing.md)' }, // broken-link
    ]
    const out = computeOpenTabIssues(tabs, new Set(), DEFAULT_LINT_OPTIONS)
    const rels = out.map((i) => i.rel).sort()
    expect(rels).toEqual(['a.md', 'b.md'])
  })

  it('respects disabled rules', () => {
    const tabs = [{ rel: 'a.md', md: '[x](missing.md)' }]
    const out = computeOpenTabIssues(tabs, new Set(), {
      ...DEFAULT_LINT_OPTIONS,
      brokenLinks: false,
    })
    expect(out).toEqual([])
  })
})

describe('openRelsFromSources', () => {
  it('returns an empty set for no sources', () => {
    expect(openRelsFromSources([])).toEqual(new Set())
  })

  it('includes every open tab rel regardless of issue count', () => {
    const sources = [
      { rel: 'foo.md', md: '' },      // no lint issues
      { rel: 'bar.md', md: '# A\n### C' }, // heading-skip issue
    ]
    const rels = openRelsFromSources(sources)
    expect(rels.has('foo.md')).toBe(true)
    expect(rels.has('bar.md')).toBe(true)
    expect(rels.size).toBe(2)
  })

  it('is used as the merge filter — workspace issues for open tabs are suppressed even when the tab has zero issues', () => {
    // Simulate: workspace scan found issues for foo.md, but foo.md is now open
    // in the editor with clean content (no issues). The merge must produce zero
    // entries for foo.md.
    const openSources = [{ rel: 'foo.md', md: '' }]  // no lint issues
    const openRels = openRelsFromSources(openSources)

    // Fake workspace issue for the same file.
    const workspaceIssues = [
      { rel: 'foo.md', line: 1, col: 1, rule: 'heading-skip', message: 'stale', severity: 'warning' as const },
    ]

    // Apply the same filter logic used in the hook's issues useMemo.
    const filtered = workspaceIssues.filter((i) => !openRels.has(i.rel))
    expect(filtered).toHaveLength(0)
  })
})

describe('useLintIssues — scan cancellation', () => {
  let readResolvers: Array<(value: { content: string; mtimeMs: number }) => void>

  beforeEach(() => {
    readResolvers = []
    ;(window as unknown as { canvFS: unknown }).canvFS = {
      pickWorkspace: async () => null,
      setWorkspace: async () => {},
      getWorkspace: async () => null,
      listDir: async () => ({ name: '', relPath: '', kind: 'dir' as const, children: [], truncated: false }),
      readFile: () => new Promise<{ content: string; mtimeMs: number }>((resolve) => {
        readResolvers.push(resolve)
      }),
      writeFile: async () => ({ mtimeMs: 0 }),
      createFile: async () => ({ mtimeMs: 0 }),
      createFolder: async () => {},
      rename: async () => {},
      delete: async () => {},
      subscribe: () => () => {},
      search: async () => ({ matches: [], truncated: false }),
      gitStatus: async () => ({ branch: null, changed: [], staged: [], untracked: [], noRepo: true }),
      gitDiff: async () => ({ relPath: '', baseRef: 'HEAD', baseText: '', currentText: '' }),
      openRemote: async () => ({ kind: 'remote' as const, display: '' }),
      listRecentRemotes: async () => [],
      closeWorkspace: async () => {},
      getWorkspaceKind: async () => null,
      reconnect: async () => {},
      onStatus: () => () => {},
    }
  })

  afterEach(() => {
    delete (window as unknown as { canvFS?: unknown }).canvFS
  })

  it('a second scan invalidates an in-flight first scan', async () => {
    const tree: DirNode = {
      name: '', relPath: '', kind: 'dir', truncated: false,
      children: [
        { name: 'a.md', relPath: 'a.md', kind: 'file', mtimeMs: 0, size: 0, binary: false },
      ],
    }

    const { result } = renderHook(() => useLintIssues({
      openSources: [],
      tree,
      opts: DEFAULT_LINT_OPTIONS,
    }))

    // Kick off the first scan. Don't await — we want the readFile to be pending.
    let firstScanPromise: Promise<void> | null = null
    await act(async () => {
      firstScanPromise = result.current.scanWorkspace()
      // Yield once so the scan reaches its first awaited readFile call.
      await Promise.resolve()
    })
    expect(result.current.scanState).toBe('scanning')
    expect(readResolvers.length).toBe(1)

    // Kick off a second scan. This bumps scanToken, invalidating the first.
    let secondScanPromise: Promise<void> | null = null
    await act(async () => {
      secondScanPromise = result.current.scanWorkspace()
      await Promise.resolve()
    })
    expect(readResolvers.length).toBe(2)

    // Resolve BOTH pending readFile calls. The first scan's content would
    // have produced a broken-link issue; the second's empty content produces
    // none. With the token bump, only the second's result should land.
    await act(async () => {
      readResolvers[0]({ content: '[bad](missing.md)', mtimeMs: 0 })
      readResolvers[1]({ content: '', mtimeMs: 0 })
      // Wait for both scan promises to settle so React state updates land.
      await firstScanPromise
      await secondScanPromise
    })

    await waitFor(() => expect(result.current.scanState).toBe('done'))
    // Empty content → no issues. If the cancellation didn't work, the first
    // scan's broken-link issue would leak in.
    expect(result.current.issues).toEqual([])
  })
})
