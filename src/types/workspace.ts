export type OpenTab =
  | { kind: 'markdown'; relPath: string; loadedMarkdown: string; mtimeMs: number }
  | { kind: 'settings' }
  | { kind: 'diff'; relPath: string; baseRef: string; baseLabel?: string }
  | { kind: 'extension'; relPath: string; extensionId: string; mode: 'viewer' | 'editor' }

export interface PinnedEntry {
  relPath: string
  mtimeMs: number
}

export type { EditorGroupId, EditorGroupState } from './editorGroup'
