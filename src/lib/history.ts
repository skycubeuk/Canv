// src/lib/history.ts
import type {
  SnapshotEntry, CreateSnapshotInput, CurrentChange,
} from './historyTypes'

export interface CanvHistory {
  init(): Promise<{ branch: string; headCommit: string }>
  createSnapshot(input: CreateSnapshotInput): Promise<SnapshotEntry>
  listSnapshots(opts?: { includeHidden?: boolean }): Promise<SnapshotEntry[]>
  getSnapshot(id: string): Promise<SnapshotEntry | null>
  diffSnapshot(snapshotId: string, relPath: string): Promise<{ baseText: string; currentText: string }>
  diffCurrent(relPath?: string): Promise<{ baseText: string; currentText: string } | CurrentChange[]>
  getCurrentChanges(): Promise<CurrentChange[]>
  restoreFilePreview(snapshotId: string, relPath: string): Promise<{ snapshotText: string; currentText: string }>
  restoreFile(snapshotId: string, relPath: string): Promise<{ rollbackSnapshotId: string }>
  hideSnapshot(id: string): Promise<SnapshotEntry>
  patchSnapshotFiles(id: string, files: string[]): Promise<void>
  getTipCommit(): Promise<string | null>
}

declare global {
  interface Window { canvHistory?: CanvHistory }
}

export function getCanvHistory(): CanvHistory | null {
  return typeof window !== 'undefined' ? (window.canvHistory ?? null) : null
}

export type { SnapshotEntry, CreateSnapshotInput, CurrentChange, SnapshotReason } from './historyTypes'
