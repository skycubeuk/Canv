import type { OpenTab } from './workspace'

export type EditorGroupId = 'g1' | 'g2'

export interface EditorGroupState {
  id: EditorGroupId
  openTabs: OpenTab[]
  activeTabKey: string | null
}
