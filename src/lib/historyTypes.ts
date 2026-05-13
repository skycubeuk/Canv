// src/lib/historyTypes.ts

export type SnapshotReason =
  | 'manual'
  | 'workspace_init'
  | 'before_ai_edit'
  | 'after_ai_edit'
  | 'before_rollback'
  | 'idle_autosave'

export interface SnapshotEntry {
  id: string                       // snap_YYYYMMDD_HHMMSS_<rand>
  commit: string                   // 40-char git SHA on refs/heads/canv-history
  createdAt: string                // ISO-8601 UTC
  reason: SnapshotReason
  summary: string
  files: string[]                  // touched-files hint; may be empty
  hidden: boolean
  metadata: Record<string, unknown>
}

export interface HistoryIndexFile {
  schemaVersion: 1
  latestSnapshot: string | null
  snapshots: SnapshotEntry[]
}

export interface WorkspaceConfig {
  schemaVersion: 1
  createdAt: string
  defaultProfile: string
  revisionArchaeology:
    | { enabled: false }
    | { enabled: true; backend: 'git-branch'; branch: string }
}

export interface CreateSnapshotInput {
  reason: SnapshotReason
  summary: string
  files?: string[]
  metadata?: Record<string, unknown>
}

export interface CurrentChange {
  relPath: string
  status: 'modified' | 'added' | 'deleted'
}
