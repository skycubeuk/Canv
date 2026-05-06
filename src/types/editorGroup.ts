import type { OpenTab } from './workspace'

export type EditorGroupId = 'g1' | 'g2'

export interface EditorGroupState {
  id: EditorGroupId
  openTabs: OpenTab[]
  activeTabKey: string | null
}

export const ALL_GROUP_IDS: EditorGroupId[] = ['g1', 'g2']
