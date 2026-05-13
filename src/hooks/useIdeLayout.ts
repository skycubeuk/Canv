import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { wsKey } from '../lib/wsKey'
import '../lib/dockTypes'

export type SidebarTab = 'files' | 'search' | 'history' | 'sites'
export type BottomTab = 'runs' | 'chat' | 'problems' | 'output'
export type DockPlacement = 'bottom' | 'right' | 'popout'
export type InAppDockPlacement = 'bottom' | 'right'

export interface SidebarLayout {
  visible: boolean
  activeTab: SidebarTab
  size: number
}

export interface BottomLayout {
  visible: boolean
  activeTab: BottomTab
  size: number
  rightSize: number
  placement: DockPlacement
  lastDockedPlacement: InAppDockPlacement
}

export interface EditorLayout {
  groupCount: 1 | 2
  sizes: [number, number]
}

export interface OutlineLayout {
  size: number
  collapsed: boolean
}

export interface IdeLayoutState {
  sidebar: SidebarLayout
  bottom: BottomLayout
  editor: EditorLayout
  outline: OutlineLayout
}

export const DEFAULT_IDE_LAYOUT: IdeLayoutState = {
  sidebar: { visible: true, activeTab: 'files', size: 20 },
  bottom: { visible: false, activeTab: 'runs', size: 30, rightSize: 30, placement: 'bottom', lastDockedPlacement: 'bottom' },
  editor: { groupCount: 1, sizes: [50, 50] },
  outline: { size: 40, collapsed: false },
}

const SIDEBAR_KEY = 'layout:sidebar'
const BOTTOM_KEY = 'layout:bottom'
const EDITOR_KEY = 'layout:editor'
const OUTLINE_KEY = 'layout:outline'

interface PersistedSlice<T> { value: T }

function coercePopoutForBrowser(b: BottomLayout): BottomLayout {
  if (b.placement !== 'popout') return b
  const electron = typeof window !== 'undefined' && window.canvDock != null
  if (electron) return b
  return { ...b, placement: b.lastDockedPlacement }
}

function readSlice<T>(root: string | null, suffix: string, fallback: T): T {
  if (!root) return fallback
  try {
    const raw = localStorage.getItem(wsKey(root, suffix))
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as PersistedSlice<T>
    return parsed.value ?? fallback
  } catch {
    return fallback
  }
}

function writeSlice<T>(root: string | null, suffix: string, value: T) {
  if (!root) return
  try {
    localStorage.setItem(wsKey(root, suffix), JSON.stringify({ value }))
  } catch {
    // quota errors handled at the app level
  }
}

export interface UseIdeLayoutApi {
  layout: IdeLayoutState
  toggleSidebar: () => void
  toggleBottom: () => void
  setSidebarTab: (tab: SidebarTab) => void
  setBottomTab: (tab: BottomTab) => void
  showBottomTab: (tab: BottomTab) => void
  setSidebarSize: (size: number) => void
  setBottomSize: (size: number) => void
  setRightSize: (size: number) => void
  setEditorSizes: (sizes: [number, number]) => void
  setGroupCount: (count: 1 | 2) => void
  setDockPlacement: (placement: DockPlacement) => void
  setOutlineSize: (size: number) => void
  toggleOutlineCollapsed: () => void
}

export function useIdeLayout(root: string | null): UseIdeLayoutApi {
  const rootRef = useRef<string | null>(root)

  const [sidebar, setSidebarState] = useState<SidebarLayout>(() => {
    const s = readSlice(root, SIDEBAR_KEY, DEFAULT_IDE_LAYOUT.sidebar)
    // Coerce stale 'git' tab (removed in RA feature) to 'files'.
    if ((s.activeTab as string) === 'git') s.activeTab = 'files'
    return s
  })
  const [bottom, setBottomState] = useState<BottomLayout>(() =>
    coercePopoutForBrowser({
      ...DEFAULT_IDE_LAYOUT.bottom,
      ...readSlice(root, BOTTOM_KEY, DEFAULT_IDE_LAYOUT.bottom),
    }),
  )
  const [editor, setEditorState] = useState<EditorLayout>(() =>
    readSlice(root, EDITOR_KEY, DEFAULT_IDE_LAYOUT.editor),
  )
  const [outline, setOutlineState] = useState<OutlineLayout>(() =>
    readSlice(root, OUTLINE_KEY, DEFAULT_IDE_LAYOUT.outline),
  )

  // Re-load when the workspace root changes.
  useEffect(() => {
    if (rootRef.current === root) return
    rootRef.current = root
    const sRaw = readSlice(root, SIDEBAR_KEY, DEFAULT_IDE_LAYOUT.sidebar)
    if ((sRaw.activeTab as string) === 'git') sRaw.activeTab = 'files'
    setSidebarState(sRaw)
    setBottomState(coercePopoutForBrowser({
      ...DEFAULT_IDE_LAYOUT.bottom,
      ...readSlice(root, BOTTOM_KEY, DEFAULT_IDE_LAYOUT.bottom),
    }))
    setEditorState(readSlice(root, EDITOR_KEY, DEFAULT_IDE_LAYOUT.editor))
    setOutlineState(readSlice(root, OUTLINE_KEY, DEFAULT_IDE_LAYOUT.outline))
  }, [root])

  useEffect(() => { writeSlice(root, SIDEBAR_KEY, sidebar) }, [root, sidebar])
  useEffect(() => { writeSlice(root, BOTTOM_KEY, bottom) }, [root, bottom])
  useEffect(() => { writeSlice(root, EDITOR_KEY, editor) }, [root, editor])
  useEffect(() => { writeSlice(root, OUTLINE_KEY, outline) }, [root, outline])

  const toggleSidebar = useCallback(() => {
    setSidebarState((s) => ({ ...s, visible: !s.visible }))
  }, [])

  const toggleBottom = useCallback(() => {
    setBottomState((s) => ({ ...s, visible: !s.visible }))
  }, [])

  const setSidebarTab = useCallback((tab: SidebarTab) => {
    setSidebarState((s) => ({ ...s, activeTab: tab }))
  }, [])

  const setBottomTab = useCallback((tab: BottomTab) => {
    setBottomState((s) => ({ ...s, activeTab: tab }))
  }, [])

  const showBottomTab = useCallback((tab: BottomTab) => {
    setBottomState((s) => ({ ...s, visible: true, activeTab: tab }))
  }, [])

  const setSidebarSize = useCallback((size: number) => {
    setSidebarState((s) => ({ ...s, size }))
  }, [])

  const setBottomSize = useCallback((size: number) => {
    setBottomState((s) => ({ ...s, size }))
  }, [])

  const setRightSize = useCallback((size: number) => {
    setBottomState((s) => ({ ...s, rightSize: size }))
  }, [])

  const setEditorSizes = useCallback((sizes: [number, number]) => {
    setEditorState((e) => ({ ...e, sizes }))
  }, [])

  const setGroupCount = useCallback((count: 1 | 2) => {
    setEditorState((e) => ({ ...e, groupCount: count }))
  }, [])

  const setOutlineSize = useCallback((size: number) => {
    setOutlineState((s) => ({ ...s, size }))
  }, [])

  const toggleOutlineCollapsed = useCallback(() => {
    setOutlineState((s) => ({ ...s, collapsed: !s.collapsed }))
  }, [])

  const setDockPlacement = useCallback((placement: DockPlacement) => {
    setBottomState((s) => {
      const next: BottomLayout = { ...s, placement }
      // Only record lastDockedPlacement when transitioning *into* popout,
      // and only if we're coming from an in-app placement.
      if (placement === 'popout' && s.placement !== 'popout') {
        next.lastDockedPlacement = s.placement === 'right' ? 'right' : 'bottom'
      }
      return next
    })
  }, [])

  return useMemo<UseIdeLayoutApi>(() => ({
    layout: { sidebar, bottom, editor, outline },
    toggleSidebar,
    toggleBottom,
    setSidebarTab,
    setBottomTab,
    showBottomTab,
    setSidebarSize,
    setBottomSize,
    setRightSize,
    setEditorSizes,
    setGroupCount,
    setDockPlacement,
    setOutlineSize,
    toggleOutlineCollapsed,
  }), [sidebar, bottom, editor, outline, toggleSidebar, toggleBottom, setSidebarTab, setBottomTab, showBottomTab, setSidebarSize, setBottomSize, setRightSize, setEditorSizes, setGroupCount, setDockPlacement, setOutlineSize, toggleOutlineCollapsed])
}
