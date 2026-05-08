import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { EditorView } from '@codemirror/view'
import { makeMarkdownState } from '../lib/cm/markdownEditor'
import { markdownToHtml } from '../lib/markdown'
import type { LineWidth } from '../hooks/useSettings'
import type { OpenTab, EditorGroupId } from '../types/workspace'
import { useContextMenu, type ContextMenuItem } from '../lib/contextMenu'
import { copyFromDom, selectAllInDom } from '../lib/contextMenuActions'

type MarkdownTab = Extract<OpenTab, { kind: 'markdown' }>
type ViewMode = 'edit' | 'preview'

export type Jumper = (line: number, index: number) => void

interface Props {
  groupId: EditorGroupId
  tab: MarkdownTab
  isActive: boolean
  fontSize: number
  lineWidth: LineWidth
  viewMode: ViewMode
  onChange: (groupId: EditorGroupId, rel: string, markdown: string) => void
  onSelectionChange?: (groupId: EditorGroupId, rel: string) => void
  onEditorReady: (groupId: EditorGroupId, rel: string, view: EditorView) => void
  onEditorDestroy: (groupId: EditorGroupId, rel: string) => void
  onJumperReady: (groupId: EditorGroupId, rel: string, jumper: Jumper) => void
  onJumperDestroy: (groupId: EditorGroupId, rel: string) => void
}

const widthClass: Record<LineWidth, string> = {
  narrow: 'max-w-[560px]',
  normal: 'max-w-[720px]',
  wide: 'max-w-[960px]',
}

export function Canvas({
  groupId, tab, isActive, fontSize, lineWidth, viewMode,
  onChange, onSelectionChange, onEditorReady, onEditorDestroy,
  onJumperReady, onJumperDestroy,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const lastLoadedRef = useRef<string>(tab.loadedMarkdown)
  const previewRef = useRef<HTMLDivElement>(null)
  const ctxMenu = useContextMenu()
  // Mirror the doc text so the preview pane re-renders. Only refreshed when
  // entering preview mode or when the tab's loadedMarkdown changes — keystrokes
  // in edit mode do NOT touch React state, since previewDoc is unread there.
  const [previewDoc, setPreviewDoc] = useState<string>(tab.loadedMarkdown)
  // Latest callbacks via ref so the editor construction doesn't capture stale closures.
  const onChangeRef = useRef(onChange)
  const onSelectionChangeRef = useRef(onSelectionChange)
  // The jumper closes over the latest viewMode so a single registered function
  // routes correctly across edit↔preview toggles without re-registration.
  const viewModeRef = useRef<ViewMode>(viewMode)
  useEffect(() => {
    onChangeRef.current = onChange
    onSelectionChangeRef.current = onSelectionChange
    viewModeRef.current = viewMode
  }, [onChange, onSelectionChange, viewMode])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const state = makeMarkdownState({
      initialDoc: tab.loadedMarkdown,
      onDocChange: (doc) => {
        onChangeRef.current(groupId, tab.relPath, doc)
      },
      onSelectionChange: () => onSelectionChangeRef.current?.(groupId, tab.relPath),
    })
    const view = new EditorView({ state, parent: container })
    viewRef.current = view
    onEditorReady(groupId, tab.relPath, view)

    const jumper: Jumper = (line, index) => {
      if (viewModeRef.current === 'preview') {
        const root = previewRef.current
        if (!root) return
        const headings = root.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6')
        const el = headings[index] as HTMLElement | undefined
        el?.scrollIntoView({ block: 'start' })
        return
      }
      const v = viewRef.current
      if (!v) return
      const doc = v.state.doc
      const safeLine = Math.max(1, Math.min(line, doc.lines))
      const linePos = doc.line(safeLine).from
      v.dispatch({
        selection: { anchor: linePos },
        effects: EditorView.scrollIntoView(linePos, { y: 'start', yMargin: 8 }),
      })
      v.focus()
    }
    onJumperReady(groupId, tab.relPath, jumper)

    return () => {
      view.destroy()
      viewRef.current = null
      onEditorDestroy(groupId, tab.relPath)
      onJumperDestroy(groupId, tab.relPath)
    }
    // Only construct the view once per (groupId, relPath). External
    // content changes are handled by the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, tab.relPath])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (lastLoadedRef.current === tab.loadedMarkdown) return
    lastLoadedRef.current = tab.loadedMarkdown
    const current = view.state.doc.toString()
    if (current === tab.loadedMarkdown) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: tab.loadedMarkdown },
    })
    // Refresh React-side preview mirror only while preview is visible —
    // edit mode never reads previewDoc, so skip the re-render there.
    if (viewMode !== 'preview') return
    setPreviewDoc(view.state.doc.toString())
  }, [tab.loadedMarkdown, viewMode])

  // Snapshot the current editor doc into React state when entering preview.
  // While in preview the editor isn't being edited, so this only needs to
  // refresh on the edit→preview toggle.
  useEffect(() => {
    if (viewMode !== 'preview') return
    const view = viewRef.current
    if (!view) return
    setPreviewDoc(view.state.doc.toString())
  }, [viewMode])

  // Manually set the preview's innerHTML so the prose subtree doesn't get
  // re-applied on every parent re-render — re-application destroys any active
  // browser selection (the DOM nodes the selection points to are replaced),
  // which made drag-selecting and Select all useless in the preview.
  useEffect(() => {
    if (viewMode !== 'preview') return
    const root = previewRef.current
    if (!root) return
    const next = markdownToHtml(previewDoc)
    if (root.innerHTML !== next) root.innerHTML = next
  }, [viewMode, previewDoc])


  return (
    <div
      className="h-full flex flex-col min-h-0"
      style={{ display: isActive ? 'flex' : 'none' }}
    >
      <div className="flex-1 overflow-y-auto px-8 py-12 min-h-0">
        <div
          className={`mx-auto ${widthClass[lineWidth]}`}
          style={{ fontSize: `${fontSize}px` }}
        >
          <div
            ref={containerRef}
            className="cm-host"
            style={{ display: viewMode === 'edit' ? 'block' : 'none' }}
          />
          {viewMode === 'preview' && (
            <div
              ref={previewRef}
              className="prose prose-stone dark:prose-invert max-w-none"
              onContextMenu={(e) => {
                const root = previewRef.current
                if (!root) return
                const hasSel = (window.getSelection()?.toString().length ?? 0) > 0
                const items: ContextMenuItem[] = [
                  { id: 'copy', label: 'Copy', disabled: !hasSel, onClick: () => { void copyFromDom() } },
                  { separator: true },
                  { id: 'select-all', label: 'Select all', onClick: () => selectAllInDom(root) },
                ]
                ctxMenu.open(e, items)
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
