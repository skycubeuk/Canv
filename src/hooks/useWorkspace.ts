import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getFs,
  isElectron,
  type DirNode,
  type FsEvent,
  type Workspace,
  type WriteResult,
} from '../lib/fs'
import type { PinnedEntry, EditorGroupId, EditorGroupState } from '../types/workspace'
import { wsKey } from '../lib/wsKey'
import { tabKey, SETTINGS_TAB_KEY, isMarkdownTab } from '../lib/tabKey'
import type { AnchorEdit, ApplyEditsResult } from '../services/workspaceEdits'
import {
  readJson,
  persistGroups,
  persistPinnedRels,
  restoreGroupsV1,
  restoreGroupsLegacy,
  restorePinned,
  type PersistedGroups,
  type PersistedPin,
  type DroppedTab,
} from './workspace/persistence'
import { useWorkspaceSaves, type ConflictNotice } from './workspace/useWorkspaceSaves'
import { useWorkspaceTabs } from './workspace/useWorkspaceTabs'
import { useWorkspaceFileTree } from './workspace/useWorkspaceFileTree'

export type { AnchorEdit, ApplyEditsResult }
export type { ConflictNotice }

const SCHEMA_VERSION = '2'
const SCHEMA_KEY = 'canv:schemaVersion'
const LAST_WS_KEY = 'canv:lastWorkspace'
const SAVE_DEBOUNCE_MS = 5000
// How long to remember our own writes before evicting them from the
// recentWrites map. Suppression itself doesn't depend on age — it matches by
// mtimeMs — so this only has to be long enough to outlast the worst-case
// delay between our writeFile resolving and the chokidar 'change' echo
// arriving (awaitWriteFinish + IPC). Observed up to ~400ms on macOS; we keep
// a generous margin to also cover slow remote/synced filesystems.
const RECENT_WRITE_EVICT_MS = 30_000

export interface WorkspaceApi {
  ready: boolean
  available: boolean
  root: string | null
  kind: Workspace | null
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
  /** Files for which a debounced write is currently in flight on disk.
   * Distinct from `dirtySet`, which is true the moment the user types.
   * UIs that display a "Saving…" indicator should key on this, not dirtySet. */
  writingSet: Set<string>
  pinned: PinnedEntry[]
  pickWorkspace: () => Promise<boolean>
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
   * Apply N anchor-based edits across N files atomically. The renderer client
   * checks anchor uniqueness; main snapshots every file before any write and
   * rolls back on per-file failure. Refuses if any target path has unsaved
   * changes (would clobber the user's buffer).
   */
  applyEdits: (edits: AnchorEdit[]) => Promise<ApplyEditsResult>
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
}

interface OnQuotaErrorOptions {
  onConflict?: (rel: string) => void
  onToast?: (msg: string) => void
  /** Override the autosave debounce window (ms). Defaults to SAVE_DEBOUNCE_MS.
   * Exposed primarily so tests can drive the save path without a 5s wait. */
  saveDebounceMs?: number
}

// ---------------------------------------------------------------------------

export function useWorkspace(opts: OnQuotaErrorOptions = {}): WorkspaceApi {
  const available = isElectron()
  const saveDebounceMs = opts.saveDebounceMs ?? SAVE_DEBOUNCE_MS

  const [root, setRoot] = useState<string | null>(null)
  const [kind, setKind] = useState<Workspace | null>(null)
  const [tree, setTree] = useState<DirNode | null>(null)
  const [treeTruncated, setTreeTruncated] = useState(false)
  const [editorGroups, setEditorGroups] = useState<EditorGroupState[]>([
    { id: 'g1', openTabs: [], activeTabKey: null },
  ])
  const [activeGroupId, setActiveGroupIdState] = useState<EditorGroupId>('g1')
  const [pinned, setPinned] = useState<PinnedEntry[]>([])
  const [dirtySet, setDirtySet] = useState<Set<string>>(new Set())
  const [writingSet, setWritingSet] = useState<Set<string>>(new Set())
  const [conflict, setConflict] = useState<ConflictNotice | null>(null)

  // No-op when running outside Electron — start in a "ready" state so the
  // boot effect doesn't have to flip it from inside the effect body.
  const [ready, setReady] = useState(() => !isElectron())

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

  // Mirror dirtySet into a ref so applyEdits can snapshot it at call time
  // without re-creating the callback per render.
  const dirtySetRef = useRef<Set<string>>(dirtySet)
  useEffect(() => { dirtySetRef.current = dirtySet }, [dirtySet])

  // ---------------------------------------------------------------------------
  // Save engine (debounced writes, tool writes, anchor edits)
  // ---------------------------------------------------------------------------

  const {
    saveTimers,
    pendingMarkdown,
    recentWrites,
    setDirty,
    getTabEolBom,
    writeFileCoalesced,
    writeFileFromTool,
    applyEdits,
    noteOwnDiskWrite,
    saveTab,
    flushAll,
  } = useWorkspaceSaves({
    editorGroupsRef,
    dirtySetRef,
    setEditorGroups,
    setDirtySet,
    setWritingSet,
    setConflict,
    onToast,
    saveDebounceMs,
  })

  // ---------------------------------------------------------------------------
  // Tab mutation methods — per-group
  // ---------------------------------------------------------------------------

  const {
    openTab,
    closeTab,
    setActiveTab,
    setActiveTabByKey,
    openSettingsTab,
    openDiffTab,
    openExtensionTab,
    closeTabByKey,
    splitRight,
    moveTab,
    setActiveGroupId,
  } = useWorkspaceTabs({
    rootRef,
    editorGroupsRef,
    activeGroupIdRef,
    setEditorGroups,
    setActiveGroupIdState,
    onToast,
    saveTimers,
    pendingMarkdown,
    writeFileCoalesced,
    setDirty,
  })

  // ---------------------------------------------------------------------------
  // Tree refresh, pins, file operations
  // ---------------------------------------------------------------------------

  const {
    refreshTree,
    scheduleTreeRefresh,
    pin,
    unpin,
    createFile,
    createFolder,
    renameOp,
    remove,
  } = useWorkspaceFileTree({
    rootRef,
    editorGroupsRef,
    activeGroupIdRef,
    pinnedRef,
    setTree,
    setTreeTruncated,
    setEditorGroups,
    setPinned,
    onToast,
  })

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
  // Workspace lifecycle
  // ---------------------------------------------------------------------------

  const adoptWorkspace = useCallback(async (rt: string) => {
    rootRef.current = rt
    setRoot(rt)
    try {
      const k = await getFs().getWorkspaceKind()
      setKind(k)
    } catch {
      setKind({ root: rt })
    }
    try { localStorage.setItem(LAST_WS_KEY, rt) } catch { /* ignore */ }
    const treeRoot = await getFs().listDir('').catch(() => null)
    if (treeRoot) {
      setTree(treeRoot)
      setTreeTruncated(Boolean(treeRoot.truncated))
    }

    const readFile = (rel: string) => getFs().readFile(rel)

    // --- Tab restoration: v1 groups or legacy flat shape ---
    const savedGroups = readJson<PersistedGroups | null>(wsKey(rt, 'groups'), null)
    let restoredGroups: EditorGroupState[]
    let restoredActiveGroupId: EditorGroupId
    let droppedTabs: DroppedTab[]

    if (savedGroups && savedGroups.version === 1) {
      ;({ restoredGroups, restoredActiveGroupId, droppedTabs } = await restoreGroupsV1(savedGroups, readFile))
    } else {
      // Backward-compat: read the legacy 'tabs' / 'activeTab' shape.
      const savedTabs = readJson<string[]>(wsKey(rt, 'tabs'), [])
      const savedActive = readJson<string | null>(wsKey(rt, 'activeTab'), null)
      ;({ restoredGroups, restoredActiveGroupId, droppedTabs } = await restoreGroupsLegacy(savedTabs, savedActive, readFile))
    }

    // --- Pinned restoration (supports legacy formats) ---
    const savedPinnedRaw = readJson<PersistedPin[]>(wsKey(rt, 'pinned'), [])
    const restoredPinned = await restorePinned(savedPinnedRaw, readFile)

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
  }, [onToast])

  const pickWorkspace = useCallback(async () => {
    if (!available) return false
    const picked = await getFs().pickWorkspace()
    if (!picked) return false
    await adoptWorkspace(picked.root)
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
    try { localStorage.removeItem(LAST_WS_KEY) } catch { /* ignore */ }
  }, [])

  const resolveConflict = useCallback(() => setConflict(null), [])

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
  }, [available, scheduleTreeRefresh, onToast, recentWrites])

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
  }, [getTabEolBom, pendingMarkdown])

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
    writingSet,
    pinned,
    pickWorkspace,
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
    applyEdits,
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
  }), [ready, available, root, kind, tree, treeTruncated, editorGroups, activeGroupId, activeTabKey, activeMarkdownRel, allOpenKeys, dirtySet, writingSet, pinned, pickWorkspace, closeWorkspace, openTab, closeTab, setActiveTab, openSettingsTab, openDiffTab, openExtensionTab, closeTabByKey, setActiveTabByKey, splitRight, moveTab, setActiveGroupId, saveTab, writeFileFromTool, applyEdits, noteOwnDiskWrite, flushAll, pin, unpin, createFile, createFolder, renameOp, remove, refreshTree, conflict, resolveConflict, reloadTabFromDisk])
}
