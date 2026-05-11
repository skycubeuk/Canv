import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorView } from '@codemirror/view'
import { selectAll as cmSelectAll } from '@codemirror/commands'
import type { Jumper } from '../components/Canvas'
import type { EditorGroupId } from '../types/workspace'
import type { LintIssue } from '../lib/lintTypes'
import type { SearchMatch } from '../lib/searchTypes'
import { findMatchInDoc } from '../lib/findMatchInDoc'
import { useFocusedDocText, createLiveDocsChannel } from './useFocusedDocText'
import { useOutline } from './useOutline'
import { tabSourceFromMarkdown, type OpenTabSource } from './useLintIssues'
import { useContextMenu, type ContextMenuItem } from '../lib/contextMenu'
import { tabKey } from '../lib/tabKey'
import type { useWorkspace } from './useWorkspace'

type WorkspaceApi = ReturnType<typeof useWorkspace>

export function editorMapKey(groupId: EditorGroupId, rel: string): string {
  return `${groupId}:${rel}`
}

export interface UseEditorRegistryArgs {
  workspace: WorkspaceApi
}

export interface UseEditorRegistryApi {
  editorsRef: React.MutableRefObject<Map<string, EditorView>>
  jumpersRef: React.MutableRefObject<Map<string, Jumper>>
  selectionTick: number
  getActiveEditor: () => EditorView | null
  getActiveEditorForGroup: (groupId: EditorGroupId) => EditorView | null
  handleEditorReady: (groupId: EditorGroupId, rel: string, view: EditorView) => void
  handleEditorDestroy: (groupId: EditorGroupId, rel: string) => void
  handleJumperReady: (groupId: EditorGroupId, rel: string, jumper: Jumper) => void
  handleJumperDestroy: (groupId: EditorGroupId, rel: string) => void
  handleEditorChange: (groupId: EditorGroupId, rel: string, markdown: string) => void
  handleEditorSelectionChange: () => void
  jumpToMatch: (match: SearchMatch, q: { query: string; regex: boolean; caseSensitive: boolean }, ordinalInFile: number) => Promise<void>
  jumpToProblem: (issue: LintIssue, allIssues: LintIssue[]) => Promise<void>
  /**
   * Latest known buffer text for a given (group, file). Reads from the
   * live-docs channel that's published on every keystroke. Returns undefined
   * when no edits have been observed — callers should fall back to the disk
   * snapshot in that case. Used by Canvas to seed CodeMirror across remount.
   */
  readLiveBuffer: (groupId: EditorGroupId, rel: string) => string | undefined
  openSources: OpenTabSource[]
  outlineNodes: ReturnType<typeof useOutline>
  focusedKey: string | null
}

export function useEditorRegistry(args: UseEditorRegistryArgs): UseEditorRegistryApi {
  const { workspace } = args

  // Map from `${groupId}:${rel}` → EditorView instance, populated when a Canvas mounts.
  const editorsRef = useRef<Map<string, EditorView>>(new Map())
  // Force a re-render after editor map mutation so consumers (FloatingToolbar) get a fresh editor reference.
  const [editorsBump, bumpEditorRev] = useState(0)

  const liveDocsChannel = useMemo(() => createLiveDocsChannel(), [])
  const bumpEditors = useCallback(() => bumpEditorRev((n) => n + 1), [])

  const jumpersRef = useRef<Map<string, Jumper>>(new Map())

  const handleJumperReady = useCallback((groupId: EditorGroupId, rel: string, jumper: Jumper) => {
    jumpersRef.current.set(editorMapKey(groupId, rel), jumper)
  }, [])

  const handleJumperDestroy = useCallback((groupId: EditorGroupId, rel: string) => {
    jumpersRef.current.delete(editorMapKey(groupId, rel))
  }, [])

  const openSources = useMemo<OpenTabSource[]>(() => {
    const seen = new Set<string>()
    const out: OpenTabSource[] = []
    for (const g of workspace.editorGroups) {
      for (const t of g.openTabs) {
        if (t.kind !== 'markdown') continue
        if (seen.has(t.relPath)) continue
        seen.add(t.relPath)
        // eslint-disable-next-line react-hooks/refs -- editorsBump in deps re-runs this memo on editor mount/unmount, so editorsRef.current is fresh
        const ed = editorsRef.current.get(editorMapKey(g.id, t.relPath))
        const md = ed ? ed.state.doc.toString() : t.loadedMarkdown
        out.push(tabSourceFromMarkdown(t.relPath, md))
      }
    }
    return out
    // editorsBump bumps when an editor mounts/unmounts so getHTML() picks up
    // newly-mounted editors. ESLint can't see this dependency because the value
    // is read from editorsRef.current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.editorGroups, editorsBump])

  const getActiveEditor = useCallback((): EditorView | null => {
    if (!workspace.activeMarkdownRel) return null
    return editorsRef.current.get(editorMapKey(workspace.activeGroupId, workspace.activeMarkdownRel)) ?? null
  }, [workspace.activeGroupId, workspace.activeMarkdownRel])

  const getActiveEditorForGroup = useCallback(
    (groupId: EditorGroupId): EditorView | null => {
      const group = workspace.editorGroups.find((g) => g.id === groupId)
      if (!group || !group.activeTabKey) return null
      const tab = group.openTabs.find((t) => tabKey(t) === group.activeTabKey)
      if (!tab || tab.kind !== 'markdown') return null
      return editorsRef.current.get(editorMapKey(groupId, tab.relPath)) ?? null
    },
    [workspace.editorGroups],
  )

  const handleEditorReady = useCallback((groupId: EditorGroupId, rel: string, view: EditorView) => {
    editorsRef.current.set(editorMapKey(groupId, rel), view)
    bumpEditors()
  }, [bumpEditors])

  const handleEditorDestroy = useCallback((groupId: EditorGroupId, rel: string) => {
    editorsRef.current.delete(editorMapKey(groupId, rel))
    bumpEditors()
  }, [bumpEditors])

  const jumpToMatch = useCallback(async (match: SearchMatch, q: { query: string; regex: boolean; caseSensitive: boolean }, ordinalInFile: number) => {
    await workspace.openTab(match.rel)
    let attempts = 0
    const tryJump = () => {
      const view = editorsRef.current.get(editorMapKey(workspace.activeGroupId, match.rel))
      if (!view) {
        if (attempts++ < 20) setTimeout(tryJump, 30)
        return
      }
      const range = findMatchInDoc(view, q.query, { regex: q.regex, caseSensitive: q.caseSensitive }, ordinalInFile)
      if (range) {
        view.dispatch({
          selection: { anchor: range.from, head: range.to },
          scrollIntoView: true,
        })
        view.focus()
      } else {
        view.focus()
      }
    }
    setTimeout(tryJump, 0)
  }, [workspace])

  const jumpToProblem = useCallback(async (issue: LintIssue, allIssues: LintIssue[]) => {
    await workspace.openTab(issue.rel)

    // Two issues with the same `match` text on different lines (e.g. the same
    // broken link repeated twice) need different ordinals — otherwise both
    // clicks jump to the first occurrence. Mirrors handleJumpToMatch's logic.
    const sameFileSameMatch = allIssues
      .filter((i) => i.rel === issue.rel && i.match === issue.match)
      .sort((a, b) => a.line - b.line)
    const ordinalInFile = Math.max(0, sameFileSameMatch.indexOf(issue))

    let attempts = 0
    const tryJump = () => {
      const view = editorsRef.current.get(editorMapKey(workspace.activeGroupId, issue.rel))
      if (!view) {
        if (attempts++ < 20) setTimeout(tryJump, 30)
        return
      }
      const range = findMatchInDoc(view, issue.match, { regex: false, caseSensitive: true }, ordinalInFile)
      if (range) {
        view.dispatch({
          selection: { anchor: range.from, head: range.to },
          scrollIntoView: true,
        })
        view.focus()
      } else {
        view.focus()
      }
    }
    setTimeout(tryJump, 0)
  }, [workspace])

  const handleEditorChange = useCallback(
    (groupId: EditorGroupId, rel: string, markdown: string) => {
      workspace.saveTab(rel, markdown, groupId)
      liveDocsChannel.publish(`${groupId}:${rel}`, markdown)
    },
    [workspace, liveDocsChannel],
  )

  const readLiveBuffer = useCallback(
    (groupId: EditorGroupId, rel: string): string | undefined =>
      liveDocsChannel.read(`${groupId}:${rel}`),
    [liveDocsChannel],
  )

  // When a tab's loadedMarkdown moves on (file reloaded, written by tool,
  // freshly opened), invalidate the matching live-buffer entry so a later
  // Canvas remount doesn't replay a stale edit on top of fresh disk content.
  // Also drops entries for tabs that have closed.
  const prevLoadedRef = useRef<Map<string, string>>(new Map())
  useEffect(() => {
    const next = new Map<string, string>()
    for (const g of workspace.editorGroups) {
      for (const t of g.openTabs) {
        if (t.kind !== 'markdown') continue
        next.set(editorMapKey(g.id, t.relPath), t.loadedMarkdown)
      }
    }
    const prev = prevLoadedRef.current
    for (const [key, beforeText] of prev) {
      const afterText = next.get(key)
      if (afterText === undefined || afterText !== beforeText) {
        liveDocsChannel.clear(key)
      }
    }
    prevLoadedRef.current = next
  }, [workspace.editorGroups, liveDocsChannel])

  const [selectionTick, setSelectionTick] = useState(0)
  const handleEditorSelectionChange = useCallback(() => {
    setSelectionTick((n) => n + 1)
  }, [])

  const focusedRel = workspace.activeMarkdownRel
  const focusedGroupId = workspace.activeGroupId
  const focusedKey = focusedRel ? `${focusedGroupId}:${focusedRel}` : null

  const focusedFallbackText = useMemo<string | null>(() => {
    if (!focusedRel) return null
    const group = workspace.editorGroups.find((g) => g.id === focusedGroupId)
    if (!group) return null
    const tab = group.openTabs.find((t) => t.kind === 'markdown' && t.relPath === focusedRel)
    if (!tab || tab.kind !== 'markdown') return null
    return tab.loadedMarkdown
  }, [focusedGroupId, focusedRel, workspace.editorGroups])

  const focusedDocText = useFocusedDocText(liveDocsChannel, focusedKey, focusedFallbackText)
  const outlineNodes = useOutline(focusedDocText)

  // Focus the active group's editor whenever the active group or active
  // markdown rel changes.
  useEffect(() => {
    const rel = workspace.activeMarkdownRel
    if (!rel) return
    const groupId = workspace.activeGroupId
    let cancelled = false
    let attempts = 0
    const tryFocus = () => {
      if (cancelled) return
      const view = editorsRef.current.get(editorMapKey(groupId, rel))
      if (!view) {
        if (attempts++ < 10) setTimeout(tryFocus, 16)
        return
      }
      setTimeout(() => {
        if (cancelled) return
        view.focus()
      }, 0)
    }
    setTimeout(tryFocus, 0)
    return () => { cancelled = true }
  }, [workspace.activeGroupId, workspace.activeMarkdownRel])

  // eslint-disable-next-line react-hooks/refs -- activeEditor is read outside JSX to drive a useEffect; editorsRef.current is intentionally accessed here
  const activeEditor = getActiveEditor()

  const ctxMenu = useContextMenu()

  useEffect(() => {
    const view = activeEditor
    if (!view) return
    const dom = view.dom
    const handler = (e: MouseEvent) => {
      const sel = view.state.selection.main
      const hasSel = !sel.empty
      const items: ContextMenuItem[] = [
        {
          id: 'cut',
          label: 'Cut',
          disabled: !hasSel,
          onClick: () => {
            const text = view.state.sliceDoc(sel.from, sel.to)
            void navigator.clipboard.writeText(text).catch(() => {})
            view.dispatch({
              changes: { from: sel.from, to: sel.to, insert: '' },
              selection: { anchor: sel.from },
            })
            view.focus()
          },
        },
        {
          id: 'copy',
          label: 'Copy',
          disabled: !hasSel,
          onClick: () => {
            const text = view.state.sliceDoc(sel.from, sel.to)
            void navigator.clipboard.writeText(text).catch(() => {})
            view.focus()
          },
        },
        {
          id: 'paste',
          label: 'Paste',
          onClick: () => {
            void (async () => {
              try {
                const text = await navigator.clipboard.readText()
                view.dispatch({
                  changes: { from: sel.from, to: sel.to, insert: text },
                  selection: { anchor: sel.from + text.length },
                })
              } catch { /* ignore */ }
              view.focus()
            })()
          },
        },
        { separator: true },
        {
          id: 'select-all',
          label: 'Select all',
          onClick: () => {
            view.focus()
            cmSelectAll(view)
          },
        },
      ]
      ctxMenu.open(e, items)
    }
    dom.addEventListener('contextmenu', handler)
    return () => { dom.removeEventListener('contextmenu', handler) }
  }, [activeEditor, ctxMenu])

  return useMemo<UseEditorRegistryApi>(() => ({
    editorsRef, jumpersRef,
    selectionTick,
    getActiveEditor, getActiveEditorForGroup,
    handleEditorReady, handleEditorDestroy,
    handleJumperReady, handleJumperDestroy,
    handleEditorChange, handleEditorSelectionChange,
    jumpToMatch, jumpToProblem,
    readLiveBuffer,
    openSources, outlineNodes, focusedKey,
  }), [
    selectionTick,
    getActiveEditor, getActiveEditorForGroup,
    handleEditorReady, handleEditorDestroy,
    handleJumperReady, handleJumperDestroy,
    handleEditorChange, handleEditorSelectionChange,
    jumpToMatch, jumpToProblem,
    readLiveBuffer,
    openSources, outlineNodes, focusedKey,
  ])
}
