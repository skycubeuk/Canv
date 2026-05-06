import type { EditorGroupId } from '../../types/workspace'

export const TAB_DRAG_MIME = 'application/x-canv-tab'

export interface TabDragPayload {
  sourceGroupId: EditorGroupId
  key: string
}

export function setTabDragPayload(e: React.DragEvent, payload: TabDragPayload) {
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData(TAB_DRAG_MIME, JSON.stringify(payload))
}

export function readTabDragPayload(e: React.DragEvent): TabDragPayload | null {
  try {
    const raw = e.dataTransfer.getData(TAB_DRAG_MIME)
    if (!raw) return null
    return JSON.parse(raw) as TabDragPayload
  } catch {
    return null
  }
}

export function hasTabDragPayload(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes(TAB_DRAG_MIME)
}
