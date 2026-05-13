import type { SearchQuery, SearchResult } from './searchTypes'
import type { GitStatusPayload, GitDiffPayload } from './gitTypes'
import type { WorkspaceConfig } from './historyTypes'

export type WorkspaceKind =
  | { kind: 'local'; root: string }
  | { kind: 'remote'; display: string }

export interface RecentRemote { raw: string; lastUsedMs: number }

export interface RemoteStatus { kind: 'remote'; state: 'online' | 'offline' }

export interface DirFile {
  name: string
  relPath: string
  kind: 'file'
  mtimeMs: number
  size: number
  binary: boolean
}

export interface DirNode {
  name: string
  relPath: string
  kind: 'dir'
  children: Array<DirNode | DirFile>
  truncated: boolean
}

export type DirEntry = DirNode | DirFile

export interface FsEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  relPath: string
  mtimeMs?: number
}

export interface ReadResult { content: string; mtimeMs: number }
export interface WriteResult { mtimeMs: number }

export interface CanvFs {
  pickWorkspace(): Promise<{ root: string } | null>
  setWorkspace(root: string): Promise<void>
  getWorkspace(): Promise<string | null>
  listDir(rel?: string): Promise<DirNode>
  readFile(rel: string): Promise<ReadResult>
  writeFile(rel: string, content: string, expectedMtimeMs?: number): Promise<WriteResult>
  createFile(rel: string, content?: string): Promise<WriteResult>
  createFolder(rel: string): Promise<void>
  rename(oldRel: string, newRel: string): Promise<void>
  delete(rel: string): Promise<void>
  subscribe(cb: (ev: FsEvent) => void): () => void
  search(query: SearchQuery): Promise<SearchResult>
  gitStatus(): Promise<GitStatusPayload & { noRepo?: boolean }>
  gitDiff(rel: string, baseRef: string): Promise<GitDiffPayload>
  readWorkspaceConfig(): Promise<WorkspaceConfig | null>
  writeWorkspaceConfig(cfg: WorkspaceConfig): Promise<true>
  openRemote(raw: string): Promise<{ kind: 'remote'; display: string }>
  listRecentRemotes(): Promise<RecentRemote[]>
  closeWorkspace(): Promise<void>
  getWorkspaceKind(): Promise<WorkspaceKind | null>
  reconnect(): Promise<void>
  onStatus(cb: (s: RemoteStatus) => void): () => void
}

declare global {
  interface Window {
    canvFS?: CanvFs
    canvConfig?: {
      list(): Promise<{
        configDir: string
        files: { file: string; absPath: string; content: string }[]
      }>
      revealFolder(): Promise<void>
    }
  }
}

export class FsUnavailableError extends Error {
  constructor() {
    super('Filesystem bridge unavailable — desktop app required')
    this.name = 'FsUnavailableError'
  }
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.canvFS
}

export function getFs(): CanvFs {
  if (typeof window === 'undefined' || !window.canvFS) throw new FsUnavailableError()
  return window.canvFS
}

export function isStaleWriteError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const msg = (err as { message?: unknown }).message
  return typeof msg === 'string' && msg.toLowerCase().includes('stale')
}

export function flattenTree(node: DirNode): Array<DirNode | DirFile> {
  const out: Array<DirNode | DirFile> = []
  const walk = (n: DirEntry) => {
    out.push(n)
    if (n.kind === 'dir') for (const c of n.children) walk(c)
  }
  for (const c of node.children) walk(c)
  return out
}

export function findEntry(node: DirNode, relPath: string): DirEntry | null {
  if (node.relPath === relPath) return node
  for (const c of node.children) {
    if (c.kind === 'dir') {
      const found = findEntry(c, relPath)
      if (found) return found
    } else if (c.relPath === relPath) {
      return c
    }
  }
  return null
}
