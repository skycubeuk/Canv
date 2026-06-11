import { useCallback, useRef } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { getFs, isStaleWriteError, type WriteResult } from '../../lib/fs'
import type { EditorGroupId, EditorGroupState } from '../../types/workspace'
import { isMarkdownTab } from '../../lib/tabKey'
import { applyEdits as applyEditsImpl, type AnchorEdit, type ApplyEditsResult } from '../../services/workspaceEdits'

export interface ConflictNotice {
  relPath: string
  diskMtimeMs: number
}

interface UseWorkspaceSavesDeps {
  editorGroupsRef: RefObject<EditorGroupState[]>
  dirtySetRef: RefObject<Set<string>>
  setEditorGroups: Dispatch<SetStateAction<EditorGroupState[]>>
  setDirtySet: Dispatch<SetStateAction<Set<string>>>
  setWritingSet: Dispatch<SetStateAction<Set<string>>>
  setConflict: Dispatch<SetStateAction<ConflictNotice | null>>
  onToast?: (msg: string) => void
  saveDebounceMs: number
}

/** Internal hook owning the debounced save engine: pending-write bookkeeping
 * refs plus every callback that writes file content to disk. */
export function useWorkspaceSaves(deps: UseWorkspaceSavesDeps) {
  const {
    editorGroupsRef,
    dirtySetRef,
    setEditorGroups,
    setDirtySet,
    setWritingSet,
    setConflict,
    onToast,
    saveDebounceMs,
  } = deps

  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const pendingMarkdown = useRef<Map<string, string>>(new Map())
  const recentWrites = useRef<Map<string, { mtimeMs: number; ts: number; content: string | null }>>(new Map())
  const lastWriterGroupRef = useRef<Map<string, EditorGroupId>>(new Map())

  const setWriting = useCallback((rel: string, writing: boolean) => {
    setWritingSet((prev) => {
      const has = prev.has(rel)
      if (writing ? has : !has) return prev
      const next = new Set(prev)
      if (writing) next.add(rel)
      else next.delete(rel)
      return next
    })
  }, [setWritingSet])

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
  }, [setDirtySet])

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
  }, [editorGroupsRef])

  const writeFileCoalesced = useCallback(async (rel: string, markdown: string, sourceGroupId?: EditorGroupId) => {
    setWriting(rel, true)
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
    } finally {
      setWriting(rel, false)
    }
  }, [setDirty, setWriting, onToast, getTabEolBom, setEditorGroups, setConflict])

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
  }, [setDirty, getTabEolBom, setEditorGroups])

  const applyEdits = useCallback(async (edits: AnchorEdit[]): Promise<ApplyEditsResult> => {
    // Snapshot the dirty set at call time so isDirty closes over a stable view
    // (no risk of mid-call state churn making a previously-clean file dirty).
    const dirtyNow = new Set(dirtySetRef.current)
    const result = await applyEditsImpl(edits, { isDirty: (p) => dirtyNow.has(p) })
    if (!result.ok) return result
    // Mark every affected file's new mtime as "our own write" so the chokidar
    // 'change' echo is suppressed in the watcher subscription. Mirrors the
    // single-file path in writeFileFromTool.
    for (const { path: rel, mtimeMs } of result.applied) {
      recentWrites.current.set(rel, { mtimeMs, ts: Date.now(), content: null })
    }
    // Refresh open tabs' mtimeMs so subsequent saves don't trip stale-mtime.
    // We deliberately do NOT update loadedMarkdown here — chokidar's change
    // event for our write is suppressed, and tabs holding this file will pick
    // up the new content on the next reload/re-open. Keeping the renderer's
    // tab-buffer model simple is more valuable than partial in-place refresh.
    setEditorGroups((prev) => prev.map((g) => ({
      ...g,
      openTabs: g.openTabs.map((t) => {
        if (!isMarkdownTab(t)) return t
        const hit = result.applied.find((a) => a.path === t.relPath)
        if (!hit) return t
        return { ...t, mtimeMs: hit.mtimeMs }
      }),
    })))
    // Drop dirty markers for every affected file; they're freshly written.
    setDirtySet((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const a of result.applied) {
        if (next.delete(a.path)) changed = true
      }
      return changed ? next : prev
    })
    return result
  }, [dirtySetRef, setEditorGroups, setDirtySet])

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

  return {
    // Bookkeeping refs the watcher / tab-close / unload paths need.
    saveTimers,
    pendingMarkdown,
    recentWrites,
    lastWriterGroupRef,
    // Callbacks.
    setDirty,
    setWriting,
    getTabEolBom,
    writeFileCoalesced,
    writeFileFromTool,
    applyEdits,
    noteOwnDiskWrite,
    saveTab,
    flushAll,
  }
}
