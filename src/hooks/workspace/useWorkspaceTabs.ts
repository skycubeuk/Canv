import { useCallback } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { getFs } from '../../lib/fs'
import type { OpenTab, EditorGroupId, EditorGroupState } from '../../types/workspace'
import { tabKey, SETTINGS_TAB_KEY, DIFF_TAB_KEY_PREFIX, EXTENSION_TAB_KEY_PREFIX, isMarkdownTab } from '../../lib/tabKey'
import { findGroup, findGroupContaining, withGroupUpdate } from './groupHelpers'
import { persistGroups } from './persistence'

interface UseWorkspaceTabsDeps {
  rootRef: RefObject<string | null>
  editorGroupsRef: RefObject<EditorGroupState[]>
  activeGroupIdRef: RefObject<EditorGroupId>
  setEditorGroups: Dispatch<SetStateAction<EditorGroupState[]>>
  setActiveGroupIdState: Dispatch<SetStateAction<EditorGroupId>>
  onToast?: (msg: string) => void
  // Save-engine pieces needed when closing a tab with a pending write.
  saveTimers: RefObject<Map<string, ReturnType<typeof setTimeout>>>
  pendingMarkdown: RefObject<Map<string, string>>
  writeFileCoalesced: (rel: string, markdown: string, sourceGroupId?: EditorGroupId) => Promise<void>
  setDirty: (rel: string, dirty: boolean) => void
}

/** Internal hook with the tab/group operations: open/close/focus tabs,
 * split, move between groups, and group focus. */
export function useWorkspaceTabs(deps: UseWorkspaceTabsDeps) {
  const {
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
  } = deps

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
  }, [onToast, rootRef, activeGroupIdRef, editorGroupsRef, setEditorGroups, setActiveGroupIdState])

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
  }, [setDirty, writeFileCoalesced, saveTimers, pendingMarkdown, rootRef, editorGroupsRef, activeGroupIdRef, setEditorGroups, setActiveGroupIdState])

  const setActiveTabByKey = useCallback((key: string | null, groupId?: EditorGroupId) => {
    const target = groupId ?? activeGroupIdRef.current
    setEditorGroups((prev) => {
      const next = withGroupUpdate(prev, target, (g) => ({ ...g, activeTabKey: key }))
      if (rootRef.current) persistGroups(rootRef.current, next, target)
      return next
    })
    setActiveGroupIdState(target)
  }, [rootRef, activeGroupIdRef, setEditorGroups, setActiveGroupIdState])

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
  }, [rootRef, activeGroupIdRef, editorGroupsRef, setEditorGroups, setActiveGroupIdState])

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
  }, [rootRef, activeGroupIdRef, setEditorGroups, setActiveGroupIdState])

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
  }, [rootRef, activeGroupIdRef, setEditorGroups, setActiveGroupIdState])

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
  }, [closeTab, rootRef, editorGroupsRef, activeGroupIdRef, setEditorGroups, setActiveGroupIdState])

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
  }, [rootRef, activeGroupIdRef, setEditorGroups, setActiveGroupIdState])

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
  }, [rootRef, setEditorGroups, setActiveGroupIdState])

  const setActiveGroupId = useCallback((groupId: EditorGroupId) => {
    if (!editorGroupsRef.current.some((g) => g.id === groupId)) return
    setActiveGroupIdState(groupId)
    if (rootRef.current) persistGroups(rootRef.current, editorGroupsRef.current, groupId)
  }, [rootRef, editorGroupsRef, setActiveGroupIdState])

  return {
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
  }
}
