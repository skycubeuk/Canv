import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getFs,
  isElectron,
  isStaleWriteError,
  type DirNode,
  type FsEvent,
  type WorkspaceKind,
  type WriteResult,
} from '../lib/fs'
import type { RemoteStatus } from '../lib/fs'
import type { OpenTab, PinnedEntry, EditorGroupId, EditorGroupState } from '../types/workspace'
import { wsKey } from '../lib/wsKey'
import { tabKey, SETTINGS_TAB_KEY, DIFF_TAB_KEY_PREFIX, EXTENSION_TAB_KEY_PREFIX, isMarkdownTab } from '../lib/tabKey'

const SCHEMA_VERSION = '2'
const SCHEMA_KEY = 'canv:schemaVersion'
const LAST_WS_KEY = 'canv:lastWorkspace'
const SAVE_DEBOUNCE_MS = 5000
const TREE_REFRESH_DEBOUNCE_MS = 200
// How long to remember our own writes before evicting them from the
// recentWrites map. Suppression itself doesn't depend on age — it matches by
// mtimeMs — so this only has to be long enough to outlast the worst-case
// delay between our writeFile resolving and the chokidar 'change' echo
// arriving (awaitWriteFinish + IPC). Observed up to ~400ms on macOS; we keep
// a generous margin to also cover slow remote/synced filesystems.
const RECENT_WRITE_EVICT_MS = 30_000

function isMd(rel: string): boolean {
  const lower = rel.toLowerCase()
  return lower.endsWith('.md') || lower.endsWith('.markdown')
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // quota errors surface via the existing global event channel — best-effort
  }
}

// ---------------------------------------------------------------------------
// Per-group helpers (pure functions, no React deps)
// ---------------------------------------------------------------------------

function findGroup(groups: EditorGroupState[], id: EditorGroupId): EditorGroupState | null {
  return groups.find((g) => g.id === id) ?? null
}

function findGroupContaining(groups: EditorGroupState[], key: string): EditorGroupState | null {
  for (const g of groups) {
    if (g.openTabs.some((t) => tabKey(t) === key)) return g
  }
  return null
}

function withGroupUpdate(
  groups: EditorGroupState[],
  id: EditorGroupId,
  updater: (g: EditorGroupState) => EditorGroupState,
): EditorGroupState[] {
  return groups.map((g) => (g.id === id ? updater(g) : g))
}

// ---------------------------------------------------------------------------

export interface ConflictNotice {
  relPath: string
  diskMtimeMs: number
}

export interface WorkspaceApi {
  ready: boolean
  available: boolean
  root: string | null
  kind: WorkspaceKind | null
  tree: DirNode | null
  treeTruncated: boolean
  /** Open editor groups (1 or 2). */
  editorGroups: EditorGroupState[]
  activeGroupId: EditorGroupId
  /** Convenience: tab key active in the focused group, or null. */
  activeTabKey: string | null
  /** Convenience: rel of the active markdown tab in the focused group, or null. */
  activeMarkdownRel: string | null
  /** Union of every tab key across every group — used for sidebar "open" indication. */
  allOpenKeys: Set<string>
  dirtySet: Set<string>
  pinned: PinnedEntry[]
  pickWorkspace: () => Promise<boolean>
  openRemote: (raw: string) => Promise<boolean>
  closeWorkspace: () => void
  /** Open a markdown tab. Defaults to the active group; pass groupId to target a specific group. */
  openTab: (rel: string, groupId?: EditorGroupId) => Promise<void>
  /** Close a markdown tab in the given group, or the group it's open in if unspecified. */
  closeTab: (rel: string, groupId?: EditorGroupId) => Promise<void>
  /** Set the active tab in the given group (or in the active group if unspecified). */
  setActiveTab: (rel: string | null, groupId?: EditorGroupId) => void
  openSettingsTab: (groupId?: EditorGroupId) => void
  openDiffTab: (relPath: string, baseRef?: string, baseLabel?: string, groupId?: EditorGroupId) => void
  openExtensionTab: (relPath: string, extensionId: string, mode: 'viewer' | 'editor', groupId?: EditorGroupId) => void
  closeTabByKey: (key: string, groupId?: EditorGroupId) => Promise<void>
  setActiveTabByKey: (key: string | null, groupId?: EditorGroupId) => void
  /** Promote the focused tab in `fromGroupId` to a new group on the right (creates `g2`). */
  splitRight: (fromGroupId?: EditorGroupId) => void
  /** Move an open tab between groups (used by tab drag-and-drop). */
  moveTab: (key: string, fromGroupId: EditorGroupId, toGroupId: EditorGroupId) => void
  /** Set the focused group. */
  setActiveGroupId: (groupId: EditorGroupId) => void
  saveTab: (rel: string, html: string, sourceGroupId?: EditorGroupId) => void
  /**
   * Write a file from a tool/agent path. Suppresses the watcher's "changed on
   * disk" prompt for our own write and refreshes any open tabs to the new
   * content. Use instead of raw `fs.writeFile` when the write originates from
   * an in-app source that bypasses the editor (e.g. the `edit_file` tool).
   */
  writeFileFromTool: (rel: string, content: string, expectedMtimeMs?: number) => Promise<WriteResult>
  /**
   * Mark an mtime as "we wrote this from the app" so the watcher's conflict
   * prompt is suppressed when the corresponding chokidar 'change' event echoes
   * back. Use after an out-of-band write performed by main (e.g. history
   * restoreFile) — call it immediately after the IPC resolves, before chokidar
   * has had time to fire the change event back to us.
   */
  noteOwnDiskWrite: (rel: string, mtimeMs: number) => void
  flushAll: () => Promise<void>
  pin: (rel: string) => Promise<void>
  unpin: (rel: string) => Promise<void>
  createFile: (rel: string, content?: string) => Promise<void>
  createFolder: (rel: string) => Promise<void>
  rename: (oldRel: string, newRel: string) => Promise<void>
  remove: (rel: string) => Promise<void>
  refreshTree: () => Promise<void>
  conflict: ConflictNotice | null
  resolveConflict: () => void
  reloadTabFromDisk: (rel: string) => Promise<void>
  remoteStatus: RemoteStatus | null
  reconnect: () => Promise<void>
}

interface OnQuotaErrorOptions {
  onConflict?: (rel: string) => void
  onToast?: (msg: string) => void
  /** Override the autosave debounce window (ms). Defaults to SAVE_DEBOUNCE_MS.
   * Exposed primarily so tests can drive the save path without a 5s wait. */
  saveDebounceMs?: number
}

// ---------------------------------------------------------------------------
// Persistence shape
// ---------------------------------------------------------------------------

interface PersistedGroups {
  version: 1
  groups: { id: EditorGroupId; tabKeys: string[]; activeTabKey: string | null }[]
  activeGroupId: EditorGroupId
}

function tabKeysFor(group: EditorGroupState): string[] {
  return group.openTabs.map((t) => {
    if (t.kind === 'markdown') return `markdown:${t.relPath}`
    if (t.kind === 'settings') return 'settings'
    if (t.kind === 'extension') return `ext:${t.extensionId}:${t.mode}:${t.relPath}`
    // diff
    return `diff:${t.relPath}@${t.baseRef}`
  })
}

// ---------------------------------------------------------------------------

export function useWorkspace(opts: OnQuotaErrorOptions = {}): WorkspaceApi {
  const available = isElectron()
  const saveDebounceMs = opts.saveDebounceMs ?? SAVE_DEBOUNCE_MS

  const [root, setRoot] = useState<string | null>(null)
  const [kind, setKind] = useState<WorkspaceKind | null>(null)
  const [tree, setTree] = useState<DirNode | null>(null)
  const [treeTruncated, setTreeTruncated] = useState(false)
  const [editorGroups, setEditorGroups] = useState<EditorGroupState[]>([
    { id: 'g1', openTabs: [], activeTabKey: null },
  ])
  const [activeGroupId, setActiveGroupIdState] = useState<EditorGroupId>('g1')
  const [pinned, setPinned] = useState<PinnedEntry[]>([])
  const [dirtySet, setDirtySet] = useState<Set<string>>(new Set())
  const [conflict, setConflict] = useState<ConflictNotice | null>(null)
  // No-op when running outside Electron — start in a "ready" state so the
  // boot effect doesn't have to flip it from inside the effect body.
  const [ready, setReady] = useState(() => !isElectron())
  const [remoteStatus, setRemoteStatus] = useState<RemoteStatus | null>(null)

  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const pendingMarkdown = useRef<Map<string, string>>(new Map())
  const recentWrites = useRef<Map<string, { mtimeMs: number; ts: number; content: string | null }>>(new Map())
  const lastWriterGroupRef = useRef<Map<string, EditorGroupId>>(new Map())
  const treeRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<string | null>(null)
  const editorGroupsRef = useRef<EditorGroupState[]>([{ id: 'g1', openTabs: [], activeTabKey: null }])
  const activeGroupIdRef = useRef<EditorGroupId>('g1')
  const pinnedRef = useRef<PinnedEntry[]>([])
  const onToast = opts.onToast

  // Mirror the latest committed values into refs so post-commit callbacks
  // (user clicks, IPC events, debounced timers) can read them without having
  // to re-create on every state change. Effects (not in-render writes) keep
  // this safe under React 19 concurrent rendering: discarded renders never
  // leak partially-updated values into the next commit.
  useEffect(() => { rootRef.current = root }, [root])
  useEffect(() => { editorGroupsRef.current = editorGroups }, [editorGroups])
  useEffect(() => { activeGroupIdRef.current = activeGroupId }, [activeGroupId])
  useEffect(() => { pinnedRef.current = pinned }, [pinned])

  const persistGroups = useCallback((rt: string, groups: EditorGroupState[], activeId: EditorGroupId) => {
    const payload: PersistedGroups = {
      version: 1,
      groups: groups.map((g) => ({ id: g.id, tabKeys: tabKeysFor(g), activeTabKey: g.activeTabKey })),
      activeGroupId: activeId,
    }
    writeJson(wsKey(rt, 'groups'), payload)
    // Clear the legacy slots once we've written the v1 shape.
    try {
      localStorage.removeItem(wsKey(rt, 'tabs'))
      localStorage.removeItem(wsKey(rt, 'activeTab'))
    } catch { /* ignore */ }
  }, [])

  const persistPinnedRels = useCallback((rt: string, list: PinnedEntry[]) => {
    writeJson(wsKey(rt, 'pinned'), list.map((p) => ({ rel: p.relPath })))
  }, [])

  const refreshTree = useCallback(async () => {
    if (!rootRef.current) return
    try {
      const next = await getFs().listDir('')
      setTree(next)
      setTreeTruncated(Boolean(next.truncated))
    } catch {
      // ignore — workspace may have been removed or permissions changed
    }
  }, [])

  const scheduleTreeRefresh = useCallback(() => {
    if (treeRefreshTimer.current) clearTimeout(treeRefreshTimer.current)
    treeRefreshTimer.current = setTimeout(() => {
      treeRefreshTimer.current = null
      refreshTree()
    }, TREE_REFRESH_DEBOUNCE_MS)
  }, [refreshTree])

  const setDirty = useCallback((rel: string, dirty: boolean) => {
    setDirtySet((prev) => {
      const has = prev.has(rel)
      if (dirty && has) return prev
      if (!dirty && !has) return prev
      const next = new Set(prev)
      if (dirty) next.add(rel)
      else next.delete(rel)
      return next
    })
  }, [])

  // Look up a markdown tab's EOL/BOM from the open-groups ref. Used by every
  // write path so a CRLF/BOM file round-trips losslessly. Returns (lf, no-bom)
  // as a safe default when no markdown tab is open for `rel` (e.g. tool-driven
  // writes to a file that isn't currently open).
  const getTabEolBom = useCallback((rel: string): { eol: 'lf' | 'crlf'; bom: boolean } => {
    for (const g of editorGroupsRef.current) {
      const t = g.openTabs.find((x) => isMarkdownTab(x) && x.relPath === rel)
      if (t && t.kind === 'markdown') {
        return { eol: t.eol, bom: t.bom }
      }
    }
    return { eol: 'lf', bom: false }
  }, [])

  const writeFileCoalesced = useCallback(async (rel: string, markdown: string, sourceGroupId?: EditorGroupId) => {
    try {
      const { eol, bom } = getTabEolBom(rel)
      const { mtimeMs } = await getFs().writeFile(rel, markdown, undefined, { eol, bom })
      recentWrites.current.set(rel, { mtimeMs, ts: Date.now(), content: markdown })
      // Update mtimeMs on every group; refresh loadedMarkdown on every OTHER group so their
      // CodeMirror instances re-sync via Canvas's lastLoadedRef effect. The source group's
      // Canvas keeps its own state (we'd reset its cursor otherwise).
      setEditorGroups((prev) =>
        prev.map((g) => ({
          ...g,
          openTabs: g.openTabs.map((t) => {
            if (!isMarkdownTab(t) || t.relPath !== rel) return t
            if (g.id === sourceGroupId) return { ...t, mtimeMs }
            return { ...t, mtimeMs, loadedMarkdown: markdown }
          }),
        })),
      )
      setDirty(rel, false)
    } catch (err) {
      if (isStaleWriteError(err)) {
        if (onToast) onToast(`File "${rel}" changed on disk — reload or overwrite from the conflict prompt.`)
        setConflict({ relPath: rel, diskMtimeMs: 0 })
      } else if (onToast) {
        onToast(`Failed to save ${rel}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }, [setDirty, onToast, getTabEolBom])

  const writeFileFromTool = useCallback(async (
    rel: string,
    content: string,
    expectedMtimeMs?: number,
  ): Promise<WriteResult> => {
    // Drop any in-flight debounced editor save for this path — the tool's
    // content supersedes whatever was queued, and the queued save would race
    // with this write and re-trigger the conflict prompt.
    const pendingTimer = saveTimers.current.get(rel)
    if (pendingTimer) {
      clearTimeout(pendingTimer)
      saveTimers.current.delete(rel)
    }
    pendingMarkdown.current.delete(rel)
    lastWriterGroupRef.current.delete(rel)

    const { eol, bom } = getTabEolBom(rel)
    const result = await getFs().writeFile(rel, content, expectedMtimeMs, { eol, bom })
    // Mark this mtime as "our own write" so the chokidar 'change' event that
    // follows is suppressed in the watcher subscription below.
    recentWrites.current.set(rel, { mtimeMs: result.mtimeMs, ts: Date.now(), content })
    // Refresh any open tabs of this file so their CodeMirror buffers re-sync.
    setEditorGroups((prev) =>
      prev.map((g) => ({
        ...g,
        openTabs: g.openTabs.map((t) => {
          if (!isMarkdownTab(t) || t.relPath !== rel) return t
          return { ...t, mtimeMs: result.mtimeMs, loadedMarkdown: content }
        }),
      })),
    )
    setDirty(rel, false)
    return result
  }, [setDirty, getTabEolBom])

  const noteOwnDiskWrite = useCallback((rel: string, mtimeMs: number) => {
    recentWrites.current.set(rel, { mtimeMs, ts: Date.now(), content: null })
  }, [])

  const saveTab = useCallback((rel: string, markdown: string, sourceGroupId?: EditorGroupId) => {
    pendingMarkdown.current.set(rel, markdown)
    if (sourceGroupId) lastWriterGroupRef.current.set(rel, sourceGroupId)
    setDirty(rel, true)
    const existing = saveTimers.current.get(rel)
    if (existing) clearTimeout(existing)
    const t = setTimeout(() => {
      saveTimers.current.delete(rel)
      const pending = pendingMarkdown.current.get(rel)
      if (pending == null) return
      pendingMarkdown.current.delete(rel)
      const writer = lastWriterGroupRef.current.get(rel)
      lastWriterGroupRef.current.delete(rel)
      writeFileCoalesced(rel, pending, writer)
    }, saveDebounceMs)
    saveTimers.current.set(rel, t)
  }, [setDirty, writeFileCoalesced, saveDebounceMs])

  const flushAll = useCallback(async () => {
    const tasks: Promise<void>[] = []
    for (const [rel, timer] of saveTimers.current.entries()) {
      clearTimeout(timer)
      const markdown = pendingMarkdown.current.get(rel)
      if (markdown != null) {
        pendingMarkdown.current.delete(rel)
        tasks.push(writeFileCoalesced(rel, markdown))
      }
    }
    saveTimers.current.clear()
    await Promise.allSettled(tasks)
  }, [writeFileCoalesced])

  // ---------------------------------------------------------------------------
  // Tab mutation methods — per-group
  // ---------------------------------------------------------------------------

  const openTab = useCallback(async (rel: string, groupId?: EditorGroupId) => {
    if (!rootRef.current) return
    // Any text file is openable in CodeMirror. Binary files (e.g. .pdf) should
    // be routed through a fileHandler extension before reaching here; if one
    // hits this path the CodeMirror buffer just shows the raw bytes, which is
    // ugly but harmless. Removing the previous .md-only gate so that .tex /
    // .json / etc files participate in language-extension highlighting.
    const targetGroup = groupId ?? activeGroupIdRef.current
    // Already open in target group?
    const existingInTarget = (findGroup(editorGroupsRef.current, targetGroup)?.openTabs ?? [])
      .find((t) => isMarkdownTab(t) && t.relPath === rel)
    if (existingInTarget) {
      setEditorGroups((prev) => withGroupUpdate(prev, targetGroup, (g) => ({ ...g, activeTabKey: rel })))
      setActiveGroupIdState(targetGroup)
      return
    }
    let r
    try {
      r = await getFs().readFile(rel)
    } catch (err) {
      if (onToast) onToast(`Couldn't open ${rel}: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    if (!r.ok) {
      const name = rel.split('/').pop() || rel
      if (r.error === 'too-large') {
        const mb = (r.size / (1024 * 1024)).toFixed(1)
        if (onToast) onToast(`${name} is too large to open (${mb} MB).`)
      } else {
        if (onToast) onToast(`${name} is not UTF-8 encoded. Opening would lose data.`)
      }
      return
    }
    const tab: OpenTab = {
      kind: 'markdown',
      relPath: rel,
      loadedMarkdown: r.content,
      mtimeMs: r.mtimeMs,
      eol: r.eol,
      bom: r.bom,
    }
    setEditorGroups((prev) => {
      const next = withGroupUpdate(prev, targetGroup, (g) => ({
        ...g,
        openTabs: [...g.openTabs, tab],
        activeTabKey: rel,
      }))
      if (rootRef.current) persistGroups(rootRef.current, next, targetGroup)
      return next
    })
    setActiveGroupIdState(targetGroup)
  }, [persistGroups, onToast])

  const closeTab = useCallback(async (rel: string, groupId?: EditorGroupId) => {
    // Flush pending writes for the rel (shared across groups since dirty state is per-rel).
    const timer = saveTimers.current.get(rel)
    if (timer) {
      clearTimeout(timer)
      saveTimers.current.delete(rel)
      const pending = pendingMarkdown.current.get(rel)
      if (pending != null) {
        pendingMarkdown.current.delete(rel)
        await writeFileCoalesced(rel, pending)
      }
    }
    // Resolve target group.
    let target: EditorGroupId
    if (groupId) {
      target = groupId
    } else {
      const containing = findGroupContaining(editorGroupsRef.current, rel)
      target = containing?.id ?? activeGroupIdRef.current
    }
    // Compute next active group synchronously (before setState batching) so we
    // can pass the correct value to setActiveGroupIdState.
    const computeNext = (prev: EditorGroupState[]): { finalGroups: EditorGroupState[]; newActiveGroup: EditorGroupId } => {
      const next = withGroupUpdate(prev, target, (g) => {
        const remaining = g.openTabs.filter((t) => !(t.kind === 'markdown' && t.relPath === rel))
        const newActive = g.activeTabKey === rel
          ? (remaining.length ? tabKey(remaining[remaining.length - 1]) : null)
          : g.activeTabKey
        return { ...g, openTabs: remaining, activeTabKey: newActive }
      })
      // If a group becomes empty AND it's not g1, drop it (collapses split).
      const collapsed = next.filter((g) => g.id === 'g1' || g.openTabs.length > 0)
      const finalGroups = collapsed.length ? collapsed : [{ id: 'g1' as const, openTabs: [], activeTabKey: null }]
      const currentActiveGroupId = activeGroupIdRef.current
      const newActiveGroup: EditorGroupId = finalGroups.some((g) => g.id === currentActiveGroupId)
        ? currentActiveGroupId
        : 'g1'
      return { finalGroups, newActiveGroup }
    }
    const { finalGroups, newActiveGroup } = computeNext(editorGroupsRef.current)
    setEditorGroups(() => {
      if (rootRef.current) persistGroups(rootRef.current, finalGroups, newActiveGroup)
      return finalGroups
    })
    setActiveGroupIdState(newActiveGroup)
    setDirty(rel, false)
  }, [persistGroups, setDirty, writeFileCoalesced])

  const setActiveTabByKey = useCallback((key: string | null, groupId?: EditorGroupId) => {
    const target = groupId ?? activeGroupIdRef.current
    setEditorGroups((prev) => {
      const next = withGroupUpdate(prev, target, (g) => ({ ...g, activeTabKey: key }))
      if (rootRef.current) persistGroups(rootRef.current, next, target)
      return next
    })
    setActiveGroupIdState(target)
  }, [persistGroups])

  const setActiveTab = setActiveTabByKey

  const openSettingsTab = useCallback((groupId?: EditorGroupId) => {
    const target = groupId ?? activeGroupIdRef.current
    const existing = editorGroupsRef.current.find((g) => g.openTabs.some((t) => t.kind === 'settings'))
    if (existing) {
      setEditorGroups((prev) =>
        withGroupUpdate(prev, existing.id, (g) => ({ ...g, activeTabKey: SETTINGS_TAB_KEY })),
      )
      setActiveGroupIdState(existing.id)
      if (rootRef.current) persistGroups(rootRef.current, editorGroupsRef.current, existing.id)
      return
    }
    setEditorGroups((prev) => {
      const next = withGroupUpdate(prev, target, (g) => ({
        ...g,
        openTabs: [...g.openTabs, { kind: 'settings' }],
        activeTabKey: SETTINGS_TAB_KEY,
      }))
      if (rootRef.current) persistGroups(rootRef.current, next, target)
      return next
    })
    setActiveGroupIdState(target)
  }, [persistGroups])

  const openDiffTab = useCallback((relPath: string, baseRef = 'HEAD', baseLabel?: string, groupId?: EditorGroupId) => {
    const target = groupId ?? activeGroupIdRef.current
    const key = `diff:${relPath}@${baseRef}`
    const tab: OpenTab = { kind: 'diff', relPath, baseRef, baseLabel }
    setEditorGroups((prev) => {
      // Singleton check inside the updater so batched calls see the latest state.
      const existingGroup = findGroupContaining(prev, key)
      if (existingGroup) {
        const next = withGroupUpdate(prev, existingGroup.id, (g) => ({ ...g, activeTabKey: key }))
        if (rootRef.current) persistGroups(rootRef.current, next, existingGroup.id)
        // Side-effect: update active group — safe in updater only for synchronous React batches.
        setActiveGroupIdState(existingGroup.id)
        return next
      }
      const next = withGroupUpdate(prev, target, (g) => ({
        ...g,
        openTabs: [...g.openTabs, tab],
        activeTabKey: key,
      }))
      if (rootRef.current) persistGroups(rootRef.current, next, target)
      return next
    })
    setActiveGroupIdState(target)
  }, [persistGroups])

  const openExtensionTab = useCallback((relPath: string, extensionId: string, mode: 'viewer' | 'editor', groupId?: EditorGroupId) => {
    const target = groupId ?? activeGroupIdRef.current
    const key = `${EXTENSION_TAB_KEY_PREFIX}${extensionId}:${relPath}`
    const tab: OpenTab = { kind: 'extension', relPath, extensionId, mode }
    setEditorGroups((prev) => {
      // If the tab is already open in any group, focus it there.
      const existingGroup = findGroupContaining(prev, key)
      if (existingGroup) {
        const next = withGroupUpdate(prev, existingGroup.id, (g) => ({ ...g, activeTabKey: key }))
        if (rootRef.current) persistGroups(rootRef.current, next, existingGroup.id)
        setActiveGroupIdState(existingGroup.id)
        return next
      }
      const next = withGroupUpdate(prev, target, (g) => ({
        ...g,
        openTabs: [...g.openTabs, tab],
        activeTabKey: key,
      }))
      if (rootRef.current) persistGroups(rootRef.current, next, target)
      return next
    })
    setActiveGroupIdState(target)
  }, [persistGroups])

  const closeTabByKey = useCallback(async (key: string, groupId?: EditorGroupId) => {
    if (key === SETTINGS_TAB_KEY) {
      let target: EditorGroupId
      if (groupId) {
        target = groupId
      } else {
        const containing = editorGroupsRef.current.find((g) => g.openTabs.some((t) => t.kind === 'settings'))
        target = containing?.id ?? activeGroupIdRef.current
      }
      // Compute next state synchronously before batching.
      const computeSettingsClose = (prev: EditorGroupState[]): { finalGroups: EditorGroupState[]; newActiveGroup: EditorGroupId } => {
        const next = withGroupUpdate(prev, target, (g) => {
          const remaining = g.openTabs.filter((t) => t.kind !== 'settings')
          const newActive = g.activeTabKey === SETTINGS_TAB_KEY
            ? (remaining.length ? tabKey(remaining[remaining.length - 1]) : null)
            : g.activeTabKey
          return { ...g, openTabs: remaining, activeTabKey: newActive }
        })
        const collapsed = next.filter((g) => g.id === 'g1' || g.openTabs.length > 0)
        const finalGroups = collapsed.length ? collapsed : [{ id: 'g1' as const, openTabs: [], activeTabKey: null }]
        const currentActiveGroupId = activeGroupIdRef.current
        const newActiveGroup: EditorGroupId = finalGroups.some((g) => g.id === currentActiveGroupId)
          ? currentActiveGroupId
          : 'g1'
        return { finalGroups, newActiveGroup }
      }
      const { finalGroups, newActiveGroup } = computeSettingsClose(editorGroupsRef.current)
      setEditorGroups(() => {
        if (rootRef.current) persistGroups(rootRef.current, finalGroups, newActiveGroup)
        return finalGroups
      })
      setActiveGroupIdState(newActiveGroup)
      return
    }
    if (key.startsWith(DIFF_TAB_KEY_PREFIX) || key.startsWith(EXTENSION_TAB_KEY_PREFIX)) {
      let target: EditorGroupId
      if (groupId) {
        target = groupId
      } else {
        const containing = findGroupContaining(editorGroupsRef.current, key)
        target = containing?.id ?? activeGroupIdRef.current
      }
      const computeKeyedClose = (prev: EditorGroupState[]): { finalGroups: EditorGroupState[]; newActiveGroup: EditorGroupId } => {
        const next = withGroupUpdate(prev, target, (g) => {
          const remaining = g.openTabs.filter((t) => tabKey(t) !== key)
          const newActive = g.activeTabKey === key
            ? (remaining.length ? tabKey(remaining[remaining.length - 1]) : null)
            : g.activeTabKey
          return { ...g, openTabs: remaining, activeTabKey: newActive }
        })
        const collapsed = next.filter((g) => g.id === 'g1' || g.openTabs.length > 0)
        const finalGroups = collapsed.length ? collapsed : [{ id: 'g1' as const, openTabs: [], activeTabKey: null }]
        const currentActiveGroupId = activeGroupIdRef.current
        const newActiveGroup: EditorGroupId = finalGroups.some((g) => g.id === currentActiveGroupId)
          ? currentActiveGroupId
          : 'g1'
        return { finalGroups, newActiveGroup }
      }
      const { finalGroups, newActiveGroup } = computeKeyedClose(editorGroupsRef.current)
      setEditorGroups(() => {
        if (rootRef.current) persistGroups(rootRef.current, finalGroups, newActiveGroup)
        return finalGroups
      })
      setActiveGroupIdState(newActiveGroup)
      return
    }
    await closeTab(key, groupId)
  }, [closeTab, persistGroups])

  // ---------------------------------------------------------------------------
  // Split / move / focus
  // ---------------------------------------------------------------------------

  const splitRight = useCallback((fromGroupId?: EditorGroupId) => {
    const source = fromGroupId ?? activeGroupIdRef.current
    setEditorGroups((prev) => {
      if (prev.length >= 2) {
        // Already split — just focus the other group.
        return prev
      }
      const sourceGroup = findGroup(prev, source)
      if (!sourceGroup) return prev
      const activeKey = sourceGroup.activeTabKey
      if (!activeKey) return prev
      // Clone the active tab into a new g2.
      const cloned = sourceGroup.openTabs.find((t) => tabKey(t) === activeKey)
      if (!cloned) return prev
      const next: EditorGroupState[] = [
        ...prev,
        { id: 'g2', openTabs: [cloned], activeTabKey: activeKey },
      ]
      if (rootRef.current) persistGroups(rootRef.current, next, 'g2')
      return next
    })
    setActiveGroupIdState('g2')
  }, [persistGroups])

  const moveTab = useCallback((key: string, fromGroupId: EditorGroupId, toGroupId: EditorGroupId) => {
    if (fromGroupId === toGroupId) return
    setEditorGroups((prev) => {
      const fromG = findGroup(prev, fromGroupId)
      if (!fromG) return prev
      const tab = fromG.openTabs.find((t) => tabKey(t) === key)
      if (!tab) return prev
      let next = prev
      // Remove from source.
      next = withGroupUpdate(next, fromGroupId, (g) => {
        const remaining = g.openTabs.filter((t) => tabKey(t) !== key)
        const newActive = g.activeTabKey === key
          ? (remaining.length ? tabKey(remaining[remaining.length - 1]) : null)
          : g.activeTabKey
        return { ...g, openTabs: remaining, activeTabKey: newActive }
      })
      // Add to destination if it exists, otherwise create it.
      const destExists = next.some((g) => g.id === toGroupId)
      if (destExists) {
        next = withGroupUpdate(next, toGroupId, (g) => {
          // If destination already has a tab with this key, focus it.
          if (g.openTabs.some((t) => tabKey(t) === key)) {
            return { ...g, activeTabKey: key }
          }
          return { ...g, openTabs: [...g.openTabs, tab], activeTabKey: key }
        })
      } else {
        next = [...next, { id: toGroupId, openTabs: [tab], activeTabKey: key }]
      }
      // Drop empty non-g1 groups.
      next = next.filter((g) => g.id === 'g1' || g.openTabs.length > 0)
      const newActiveGroup: EditorGroupId = next.some((g) => g.id === toGroupId) ? toGroupId : 'g1'
      if (rootRef.current) persistGroups(rootRef.current, next, newActiveGroup)
      return next
    })
    setActiveGroupIdState(toGroupId)
  }, [persistGroups])

  const setActiveGroupId = useCallback((groupId: EditorGroupId) => {
    if (!editorGroupsRef.current.some((g) => g.id === groupId)) return
    setActiveGroupIdState(groupId)
    if (rootRef.current) persistGroups(rootRef.current, editorGroupsRef.current, groupId)
  }, [persistGroups])

  // ---------------------------------------------------------------------------
  // Reload from disk
  // ---------------------------------------------------------------------------

  const reloadTabFromDisk = useCallback(async (rel: string) => {
    const groups = editorGroupsRef.current
    if (!groups.some((g) => g.openTabs.some((t) => t.kind === 'markdown' && t.relPath === rel))) return
    try {
      const r = await getFs().readFile(rel)
      if (!r.ok) return
      const { content, mtimeMs, eol, bom } = r
      setEditorGroups((prev) =>
        prev.map((g) => ({
          ...g,
          openTabs: g.openTabs.map((t) =>
            t.kind === 'markdown' && t.relPath === rel ? { ...t, loadedMarkdown: content, mtimeMs, eol, bom } : t,
          ),
        })),
      )
      setDirty(rel, false)
    } catch {
      // ignore
    }
  }, [setDirty])

  // ---------------------------------------------------------------------------
  // Pin operations
  // ---------------------------------------------------------------------------

  const pin = useCallback(async (rel: string) => {
    if (!isMd(rel)) {
      if (onToast) onToast('Only .md / .markdown files can be pinned to context')
      return
    }
    if (pinnedRef.current.some((p) => p.relPath === rel)) return
    let mtimeMs = 0
    try {
      const stat = await getFs().readFile(rel)
      if (stat.ok) mtimeMs = stat.mtimeMs
    } catch {
      // file may have just been deleted
    }
    const entry: PinnedEntry = { relPath: rel, mtimeMs }
    setPinned((prev) => {
      const next = [...prev, entry]
      if (rootRef.current) persistPinnedRels(rootRef.current, next)
      return next
    })
  }, [persistPinnedRels, onToast])

  const unpin = useCallback(async (rel: string) => {
    if (!pinnedRef.current.some((p) => p.relPath === rel)) return
    setPinned((prev) => {
      const next = prev.filter((p) => p.relPath !== rel)
      if (rootRef.current) persistPinnedRels(rootRef.current, next)
      return next
    })
  }, [persistPinnedRels])

  // ---------------------------------------------------------------------------
  // File operations
  // ---------------------------------------------------------------------------

  const createFile = useCallback(async (rel: string, content = '') => {
    await getFs().createFile(rel, content)
    await refreshTree()
  }, [refreshTree])

  const createFolder = useCallback(async (rel: string) => {
    await getFs().createFolder(rel)
    await refreshTree()
  }, [refreshTree])

  const renameOp = useCallback(async (oldRel: string, newRel: string) => {
    await getFs().rename(oldRel, newRel)
    setEditorGroups((prev) =>
      prev.map((g) => {
        const updatedTabs = g.openTabs.map((t) => {
          if (isMarkdownTab(t) && t.relPath === oldRel) return { ...t, relPath: newRel }
          if (t.kind === 'diff' && t.relPath === oldRel) return { ...t, relPath: newRel }
          return t
        })
        // Re-derive activeTabKey using the updated tab at the same slot index.
        const activeIdx = g.openTabs.findIndex((t) => tabKey(t) === g.activeTabKey)
        const newActiveTabKey = activeIdx >= 0 ? tabKey(updatedTabs[activeIdx]) : g.activeTabKey
        return { ...g, openTabs: updatedTabs, activeTabKey: newActiveTabKey }
      }),
    )
    setPinned((prev) => prev.map((p) => (p.relPath === oldRel ? { ...p, relPath: newRel } : p)))
    await refreshTree()
    if (rootRef.current) {
      persistGroups(rootRef.current, editorGroupsRef.current, activeGroupIdRef.current)
      persistPinnedRels(rootRef.current, pinnedRef.current)
    }
  }, [persistGroups, persistPinnedRels, refreshTree])

  const remove = useCallback(async (rel: string) => {
    await getFs().delete(rel)
    setEditorGroups((prev) => {
      const cleaned = prev.map((g) => {
        const remaining = g.openTabs.filter(
          (t) => !(isMarkdownTab(t) && t.relPath === rel) && !(t.kind === 'diff' && t.relPath === rel),
        )
        const newActive = g.activeTabKey && !remaining.some((t) => tabKey(t) === g.activeTabKey)
          ? (remaining.length ? tabKey(remaining[remaining.length - 1]) : null)
          : g.activeTabKey
        return { ...g, openTabs: remaining, activeTabKey: newActive }
      })
      const collapsed = cleaned.filter((g) => g.id === 'g1' || g.openTabs.length > 0)
      const finalGroups = collapsed.length ? collapsed : [{ id: 'g1' as const, openTabs: [], activeTabKey: null }]
      const newActiveGroup: EditorGroupId = finalGroups.some((g) => g.id === activeGroupIdRef.current)
        ? activeGroupIdRef.current
        : 'g1'
      if (rootRef.current) persistGroups(rootRef.current, finalGroups, newActiveGroup)
      return finalGroups
    })
    setPinned((prev) => {
      const next = prev.filter((p) => p.relPath !== rel)
      if (rootRef.current) persistPinnedRels(rootRef.current, next)
      return next
    })
    await refreshTree()
  }, [persistGroups, persistPinnedRels, refreshTree])

  // ---------------------------------------------------------------------------
  // Workspace lifecycle
  // ---------------------------------------------------------------------------

  const adoptWorkspace = useCallback(async (rt: string) => {
    rootRef.current = rt
    setRoot(rt)
    setRemoteStatus(null)
    try {
      const k = await getFs().getWorkspaceKind()
      setKind(k)
    } catch {
      setKind({ kind: 'local', root: rt })
    }
    try { localStorage.setItem(LAST_WS_KEY, rt) } catch { /* ignore */ }
    const treeRoot = await getFs().listDir('').catch(() => null)
    if (treeRoot) {
      setTree(treeRoot)
      setTreeTruncated(Boolean(treeRoot.truncated))
    }

    // --- Tab restoration: v1 groups or legacy flat shape ---
    const savedGroups = readJson<PersistedGroups | null>(wsKey(rt, 'groups'), null)
    let restoredGroups: EditorGroupState[]
    let restoredActiveGroupId: EditorGroupId
    const droppedTabs: { rel: string; reason: 'not-utf8' | 'too-large' }[] = []

    if (savedGroups && savedGroups.version === 1) {
      restoredGroups = []
      for (const g of savedGroups.groups) {
        const tabs: OpenTab[] = []
        let settingsRestored = false
        for (const stored of g.tabKeys) {
          if (stored === 'settings') {
            if (settingsRestored) continue
            tabs.push({ kind: 'settings' })
            settingsRestored = true
            continue
          }
          if (stored.startsWith('diff:')) {
            const inner = stored.slice('diff:'.length)
            const atIdx = inner.lastIndexOf('@')
            if (atIdx >= 1) {
              const relPath = inner.slice(0, atIdx)
              const baseRef = inner.slice(atIdx + 1)
              if (relPath && baseRef) {
                tabs.push({ kind: 'diff', relPath, baseRef })
              }
            }
            continue
          }
          if (stored.startsWith('ext:')) {
            // Format: 'ext:<extensionId>:<mode>:<relPath>'
            const rest = stored.slice('ext:'.length)
            const firstColon = rest.indexOf(':')
            if (firstColon >= 1) {
              const extensionId = rest.slice(0, firstColon)
              const rest2 = rest.slice(firstColon + 1)
              const secondColon = rest2.indexOf(':')
              if (secondColon >= 1) {
                const mode = rest2.slice(0, secondColon) as 'viewer' | 'editor'
                const relPath = rest2.slice(secondColon + 1)
                if (relPath && (mode === 'viewer' || mode === 'editor')) {
                  tabs.push({ kind: 'extension', relPath, extensionId, mode })
                }
              }
            }
            continue
          }
          const rel = stored.startsWith('markdown:') ? stored.slice('markdown:'.length) : stored
          try {
            const r = await getFs().readFile(rel)
            if (!r.ok) {
              droppedTabs.push({ rel, reason: r.error })
              continue
            }
            tabs.push({
              kind: 'markdown',
              relPath: rel,
              loadedMarkdown: r.content,
              mtimeMs: r.mtimeMs,
              eol: r.eol,
              bom: r.bom,
            })
          } catch {
            // file deleted externally — skip
          }
        }
        const fallbackActive = tabs.length
          ? (g.activeTabKey && tabs.some((t) => tabKey(t) === g.activeTabKey)
              ? g.activeTabKey
              : tabKey(tabs[tabs.length - 1]))
          : null
        restoredGroups.push({ id: g.id, openTabs: tabs, activeTabKey: fallbackActive })
      }
      // Clamp to known group ids and ensure g1 always exists.
      if (!restoredGroups.some((g) => g.id === 'g1')) {
        restoredGroups.unshift({ id: 'g1', openTabs: [], activeTabKey: null })
      }
      restoredActiveGroupId = restoredGroups.some((g) => g.id === savedGroups.activeGroupId)
        ? savedGroups.activeGroupId
        : 'g1'
    } else {
      // Backward-compat: read the legacy 'tabs' / 'activeTab' shape.
      const savedTabs = readJson<string[]>(wsKey(rt, 'tabs'), [])
      const savedActive = readJson<string | null>(wsKey(rt, 'activeTab'), null)
      const tabs: OpenTab[] = []
      let settingsRestored = false
      for (const stored of savedTabs) {
        if (stored === 'settings') {
          if (settingsRestored) continue
          tabs.push({ kind: 'settings' })
          settingsRestored = true
          continue
        }
        if (stored.startsWith('diff:')) {
          const inner = stored.slice('diff:'.length)
          const atIdx = inner.lastIndexOf('@')
          if (atIdx >= 1) {
            const relPath = inner.slice(0, atIdx)
            const baseRef = inner.slice(atIdx + 1)
            if (relPath && baseRef) {
              tabs.push({ kind: 'diff', relPath, baseRef })
            }
          }
          continue
        }
        if (stored.startsWith('ext:')) {
          const rest = stored.slice('ext:'.length)
          const firstColon = rest.indexOf(':')
          if (firstColon >= 1) {
            const extensionId = rest.slice(0, firstColon)
            const rest2 = rest.slice(firstColon + 1)
            const secondColon = rest2.indexOf(':')
            if (secondColon >= 1) {
              const mode = rest2.slice(0, secondColon) as 'viewer' | 'editor'
              const relPath = rest2.slice(secondColon + 1)
              if (relPath && (mode === 'viewer' || mode === 'editor')) {
                tabs.push({ kind: 'extension', relPath, extensionId, mode })
              }
            }
          }
          continue
        }
        const rel = stored.startsWith('markdown:') ? stored.slice('markdown:'.length) : stored
        try {
          const r = await getFs().readFile(rel)
          if (!r.ok) {
            droppedTabs.push({ rel, reason: r.error })
            continue
          }
          tabs.push({
            kind: 'markdown',
            relPath: rel,
            loadedMarkdown: r.content,
            mtimeMs: r.mtimeMs,
            eol: r.eol,
            bom: r.bom,
          })
        } catch {
          // file deleted externally — skip
        }
      }
      const fallbackActive = tabs.length
        ? (savedActive && tabs.some((t) => tabKey(t) === savedActive)
            ? savedActive
            : tabKey(tabs[tabs.length - 1]))
        : null
      restoredGroups = [{ id: 'g1', openTabs: tabs, activeTabKey: fallbackActive }]
      restoredActiveGroupId = 'g1'
    }

    // --- Pinned restoration (supports legacy formats) ---
    // Legacy format: string[] | {rel, mode?}[] — we now only keep {relPath, mtimeMs}.
    type PersistedPin = string | { rel: string; mode?: string }
    const savedPinnedRaw = readJson<PersistedPin[]>(wsKey(rt, 'pinned'), [])
    const restoredPinned: PinnedEntry[] = []
    for (const p of savedPinnedRaw) {
      const rel = typeof p === 'string' ? p : p.rel
      try {
        const file = await getFs().readFile(rel)
        if (!file.ok) continue
        restoredPinned.push({ relPath: rel, mtimeMs: file.mtimeMs })
      } catch {
        // skip missing
      }
    }

    setEditorGroups(restoredGroups)
    setActiveGroupIdState(restoredActiveGroupId)
    setPinned(restoredPinned)
    // Canonicalise persisted state (especially after a backward-compat migration).
    persistGroups(rt, restoredGroups, restoredActiveGroupId)
    persistPinnedRels(rt, restoredPinned)

    if (droppedTabs.length > 0 && onToast) {
      const lines = droppedTabs.map((d) => `${d.rel} (${d.reason})`).join('; ')
      onToast(`${droppedTabs.length} file(s) couldn't be reopened: ${lines}`)
    }
  }, [persistGroups, persistPinnedRels, onToast])

  const pickWorkspace = useCallback(async () => {
    if (!available) return false
    const picked = await getFs().pickWorkspace()
    if (!picked) return false
    await adoptWorkspace(picked.root)
    try { localStorage.setItem(SCHEMA_KEY, SCHEMA_VERSION) } catch { /* ignore */ }
    return true
  }, [available, adoptWorkspace])

  const openRemote = useCallback(async (raw: string) => {
    if (!available) return false
    await getFs().openRemote(raw)
    // Use the connection string itself as the workspace identifier (key for
    // localStorage-persisted tab/pin state). It's stable per remote workspace.
    await adoptWorkspace(raw)
    try { localStorage.setItem(SCHEMA_KEY, SCHEMA_VERSION) } catch { /* ignore */ }
    return true
  }, [available, adoptWorkspace])

  const closeWorkspace = useCallback(() => {
    rootRef.current = null
    setRoot(null)
    setKind(null)
    setTree(null)
    setEditorGroups([{ id: 'g1', openTabs: [], activeTabKey: null }])
    setActiveGroupIdState('g1')
    setPinned([])
    setDirtySet(new Set())
    setRemoteStatus(null)
    try { localStorage.removeItem(LAST_WS_KEY) } catch { /* ignore */ }
  }, [])

  const resolveConflict = useCallback(() => setConflict(null), [])

  const reconnect = useCallback(async () => {
    await getFs().reconnect()
  }, [])

  // Boot: try to re-attach the last workspace if present.
  useEffect(() => {
    if (!available) return
    let cancelled = false
    ;(async () => {
      try {
        const last = localStorage.getItem(LAST_WS_KEY)
        if (last) {
          await getFs().setWorkspace(last)
          if (!cancelled) await adoptWorkspace(last)
        }
      } catch {
        try { localStorage.removeItem(LAST_WS_KEY) } catch { /* ignore */ }
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => { cancelled = true }
  }, [available, adoptWorkspace])

  // Clean up legacy context-cache.json on workspace open.
  useEffect(() => {
    if (!isElectron() || !root) return
    void (async () => {
      try { await getFs().delete('.canv/context-cache.json') } catch { /* fine — file may not exist */ }
    })()
  }, [root])

  // Watcher subscription.
  useEffect(() => {
    if (!available) return
    const unsub = getFs().subscribe((ev: FsEvent) => {
      const { type, relPath, mtimeMs } = ev
      if (type === 'add' || type === 'addDir' || type === 'unlink' || type === 'unlinkDir') {
        scheduleTreeRefresh()
      }
      if (type === 'unlink') {
        const groups = editorGroupsRef.current
        if (groups.some((g) => g.openTabs.some((t) => t.kind === 'markdown' && t.relPath === relPath))) {
          setEditorGroups((prev) => {
            const cleaned = prev.map((g) => {
              const remaining = g.openTabs.filter((t) => !(t.kind === 'markdown' && t.relPath === relPath))
              const newActive = g.activeTabKey === relPath
                ? (remaining.length ? tabKey(remaining[remaining.length - 1]) : null)
                : g.activeTabKey
              return { ...g, openTabs: remaining, activeTabKey: newActive }
            })
            const collapsed = cleaned.filter((g) => g.id === 'g1' || g.openTabs.length > 0)
            const finalGroups = collapsed.length ? collapsed : [{ id: 'g1' as const, openTabs: [], activeTabKey: null }]
            const newActiveGroup: EditorGroupId = finalGroups.some((g) => g.id === activeGroupIdRef.current)
              ? activeGroupIdRef.current
              : 'g1'
            if (rootRef.current) persistGroups(rootRef.current, finalGroups, newActiveGroup)
            return finalGroups
          })
          if (onToast) onToast(`Closed "${relPath}" — file was deleted on disk`)
        }
        if (pinnedRef.current.some((p) => p.relPath === relPath)) {
          setPinned((prev) => prev.filter((p) => p.relPath !== relPath))
        }
      }
      if (type === 'change' && typeof mtimeMs === 'number') {
        // Match own-writes by mtime, not by wall-clock age. The mtimeMs we
        // recorded at writeFile time uniquely identifies the bytes we put on
        // disk; if chokidar reports back that mtime, the file is exactly what
        // we wrote — regardless of how long the awaitWriteFinish + IPC echo
        // took to arrive. Evict stale entries opportunistically so the map
        // doesn't grow unbounded.
        const cutoff = Date.now() - RECENT_WRITE_EVICT_MS
        for (const [k, v] of recentWrites.current) {
          if (v.ts < cutoff) recentWrites.current.delete(k)
        }
        const recent = recentWrites.current.get(relPath)
        if (recent && Math.abs(recent.mtimeMs - mtimeMs) < 2) {
          return // our own write (mtime fast path)
        }
        // Update mtime on pinned entries when the file changes externally.
        const isPinned = pinnedRef.current.some((p) => p.relPath === relPath)
        if (isPinned) {
          setPinned((prev) => prev.map((p) => p.relPath === relPath ? { ...p, mtimeMs } : p))
        }
        const groupsHaveIt = editorGroupsRef.current.some((g) =>
          g.openTabs.some((t) => t.kind === 'markdown' && t.relPath === relPath),
        )
        if (!groupsHaveIt) return
        // Second-check: the mtime fast path missed, but the disk content may
        // still match what we last wrote. This happens on Windows when the
        // post-writeFile stat returns a slightly different mtime than
        // chokidar's later poll (NTFS metadata lazy-flush, AV/indexer touch,
        // chokidar 5 backend differences). Read the file and compare content
        // before showing the conflict popup. Done async so the synchronous
        // event handler stays cheap; ordering doesn't matter because the
        // user can't act on a popup that hasn't appeared yet.
        void (async () => {
          try {
            const r = await getFs().readFile(relPath)
            if (!r.ok) {
              setConflict({ relPath, diskMtimeMs: mtimeMs })
              return
            }
            const { content: diskContent, mtimeMs: statMtime } = r
            const recordedContent = recent?.content ?? null
            if (recordedContent !== null && diskContent === recordedContent) {
              // Disk matches what we wrote — keep the recentWrites entry
              // current under the new mtime so the next echo (if any) takes
              // the fast path, and refresh open tabs' mtimeMs to match.
              recentWrites.current.set(relPath, { mtimeMs: statMtime, ts: Date.now(), content: recordedContent })
              setEditorGroups((prev) =>
                prev.map((g) => ({
                  ...g,
                  openTabs: g.openTabs.map((t) =>
                    isMarkdownTab(t) && t.relPath === relPath ? { ...t, mtimeMs: statMtime } : t,
                  ),
                })),
              )
              return
            }
            setConflict({ relPath, diskMtimeMs: mtimeMs })
          } catch {
            // Read failed (file vanished, permissions changed, etc.) — fall
            // back to the conservative behaviour and surface the conflict.
            setConflict({ relPath, diskMtimeMs: mtimeMs })
          }
        })()
      }
    })
    return () => { unsub() }
  }, [available, scheduleTreeRefresh, persistGroups, onToast])

  // Remote status subscription.
  useEffect(() => {
    if (!available) return
    return getFs().onStatus((s) => {
      setRemoteStatus((prev) => {
        const wasOffline = prev?.state === 'offline'
        if (wasOffline && s.state === 'online') {
          // Re-issue listDir to pick up any changes that happened while disconnected.
          scheduleTreeRefresh()
        }
        return s
      })
    })
  }, [available, scheduleTreeRefresh])

  // Flush on unload.
  useEffect(() => {
    const handler = () => {
      for (const [rel, markdown] of pendingMarkdown.current.entries()) {
        try {
          // Thread the open tab's EOL/BOM so a CRLF/BOM file with unsaved edits
          // at app exit doesn't get silently re-encoded to LF/no-BOM. Defaults
          // to (lf, no-bom) when no markdown tab is open for `rel`.
          const { eol, bom } = getTabEolBom(rel)
          // best-effort sync write; the IPC is async so this is fire-and-forget
          getFs().writeFile(rel, markdown, undefined, { eol, bom }).catch(() => { /* ignore */ })
        } catch { /* ignore */ }
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [getTabEolBom])

  // ---------------------------------------------------------------------------
  // Derived selectors
  // ---------------------------------------------------------------------------

  const activeTabKey = useMemo<string | null>(() => {
    const g = editorGroups.find((g) => g.id === activeGroupId)
    return g?.activeTabKey ?? null
  }, [editorGroups, activeGroupId])

  const activeMarkdownRel = useMemo<string | null>(() => {
    if (!activeTabKey || activeTabKey === SETTINGS_TAB_KEY) return null
    const g = editorGroups.find((g) => g.id === activeGroupId)
    if (!g) return null
    const tab = g.openTabs.find((t) => tabKey(t) === activeTabKey)
    return tab && isMarkdownTab(tab) ? tab.relPath : null
  }, [editorGroups, activeGroupId, activeTabKey])

  const allOpenKeys = useMemo<Set<string>>(() => {
    const out = new Set<string>()
    for (const g of editorGroups) for (const t of g.openTabs) out.add(tabKey(t))
    return out
  }, [editorGroups])

  // ---------------------------------------------------------------------------

  return useMemo<WorkspaceApi>(() => ({
    ready,
    available,
    root,
    kind,
    tree,
    treeTruncated,
    editorGroups,
    activeGroupId,
    activeTabKey,
    activeMarkdownRel,
    allOpenKeys,
    dirtySet,
    pinned,
    pickWorkspace,
    openRemote,
    closeWorkspace,
    openTab,
    closeTab,
    setActiveTab,
    openSettingsTab,
    openDiffTab,
    openExtensionTab,
    closeTabByKey,
    setActiveTabByKey,
    splitRight,
    moveTab,
    setActiveGroupId,
    saveTab,
    writeFileFromTool,
    noteOwnDiskWrite,
    flushAll,
    pin,
    unpin,
    createFile,
    createFolder,
    rename: renameOp,
    remove,
    refreshTree,
    conflict,
    resolveConflict,
    reloadTabFromDisk,
    remoteStatus,
    reconnect,
  }), [ready, available, root, kind, tree, treeTruncated, editorGroups, activeGroupId, activeTabKey, activeMarkdownRel, allOpenKeys, dirtySet, pinned, pickWorkspace, openRemote, closeWorkspace, openTab, closeTab, setActiveTab, openSettingsTab, openDiffTab, openExtensionTab, closeTabByKey, setActiveTabByKey, splitRight, moveTab, setActiveGroupId, saveTab, writeFileFromTool, noteOwnDiskWrite, flushAll, pin, unpin, createFile, createFolder, renameOp, remove, refreshTree, conflict, resolveConflict, reloadTabFromDisk, remoteStatus, reconnect])
}
