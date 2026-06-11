import { useCallback, useRef } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { getFs, type DirNode } from '../../lib/fs'
import type { PinnedEntry, EditorGroupId, EditorGroupState } from '../../types/workspace'
import { tabKey, isMarkdownTab } from '../../lib/tabKey'
import { isMd } from './groupHelpers'
import { persistGroups, persistPinnedRels } from './persistence'

const TREE_REFRESH_DEBOUNCE_MS = 200

interface UseWorkspaceFileTreeDeps {
  rootRef: RefObject<string | null>
  editorGroupsRef: RefObject<EditorGroupState[]>
  activeGroupIdRef: RefObject<EditorGroupId>
  pinnedRef: RefObject<PinnedEntry[]>
  setTree: Dispatch<SetStateAction<DirNode | null>>
  setTreeTruncated: Dispatch<SetStateAction<boolean>>
  setEditorGroups: Dispatch<SetStateAction<EditorGroupState[]>>
  setPinned: Dispatch<SetStateAction<PinnedEntry[]>>
  onToast?: (msg: string) => void
}

/** Internal hook with tree refresh, pin/unpin, and file CRUD operations. */
export function useWorkspaceFileTree(deps: UseWorkspaceFileTreeDeps) {
  const {
    rootRef,
    editorGroupsRef,
    activeGroupIdRef,
    pinnedRef,
    setTree,
    setTreeTruncated,
    setEditorGroups,
    setPinned,
    onToast,
  } = deps

  const treeRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshTree = useCallback(async () => {
    if (!rootRef.current) return
    try {
      const next = await getFs().listDir('')
      setTree(next)
      setTreeTruncated(Boolean(next.truncated))
    } catch {
      // ignore — workspace may have been removed or permissions changed
    }
  }, [rootRef, setTree, setTreeTruncated])

  const scheduleTreeRefresh = useCallback(() => {
    if (treeRefreshTimer.current) clearTimeout(treeRefreshTimer.current)
    treeRefreshTimer.current = setTimeout(() => {
      treeRefreshTimer.current = null
      refreshTree()
    }, TREE_REFRESH_DEBOUNCE_MS)
  }, [refreshTree])

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
  }, [onToast, rootRef, pinnedRef, setPinned])

  const unpin = useCallback(async (rel: string) => {
    if (!pinnedRef.current.some((p) => p.relPath === rel)) return
    setPinned((prev) => {
      const next = prev.filter((p) => p.relPath !== rel)
      if (rootRef.current) persistPinnedRels(rootRef.current, next)
      return next
    })
  }, [rootRef, pinnedRef, setPinned])

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
  }, [refreshTree, rootRef, editorGroupsRef, activeGroupIdRef, pinnedRef, setEditorGroups, setPinned])

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
  }, [refreshTree, rootRef, activeGroupIdRef, setEditorGroups, setPinned])

  return {
    refreshTree,
    scheduleTreeRefresh,
    pin,
    unpin,
    createFile,
    createFolder,
    renameOp,
    remove,
  }
}
