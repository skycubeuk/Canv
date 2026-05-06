import type { DirNode, DirEntry } from './fs'

export interface InventoryTreeNode {
  path: string
  kind: 'dir' | 'file'
  size?: number
  children?: InventoryTreeNode[]
  truncated?: boolean
}

export interface Inventory {
  workspaceRoot: string
  activeDoc: { path: string; lines: number } | null
  pinned: string[]
  tree: InventoryTreeNode
}

export interface BuildInventoryParams {
  tree: DirNode
  activeDocPath: string | null
  activeDocLineCount?: number
  pinned: string[]
  /** Default 3. */
  maxDepth?: number
  /** Default 200. */
  maxFilesPerFolder?: number
  /** Optional friendly root name; defaults to '(workspace)'. */
  workspaceRoot?: string
}

export function buildInventory(p: BuildInventoryParams): Inventory {
  const maxDepth = p.maxDepth ?? 3
  const maxFiles = p.maxFilesPerFolder ?? 200
  return {
    workspaceRoot: p.workspaceRoot ?? '(workspace)',
    activeDoc: p.activeDocPath
      ? { path: p.activeDocPath, lines: p.activeDocLineCount ?? 0 }
      : null,
    pinned: [...p.pinned],
    tree: nodeFor(p.tree, 0, maxDepth, maxFiles),
  }
}

function nodeFor(n: DirEntry, depth: number, maxDepth: number, maxFiles: number): InventoryTreeNode {
  if (n.kind === 'file') {
    return { path: n.relPath, kind: 'file', size: n.size }
  }
  if (depth >= maxDepth) {
    return { path: n.relPath, kind: 'dir', truncated: true }
  }
  const children: InventoryTreeNode[] = []
  let truncated = n.truncated
  let fileCount = 0
  for (const c of n.children) {
    if (c.kind === 'file') {
      if (fileCount >= maxFiles) { truncated = true; break }
      fileCount++
    }
    children.push(nodeFor(c, depth + 1, maxDepth, maxFiles))
  }
  const out: InventoryTreeNode = { path: n.relPath, kind: 'dir', children }
  if (truncated) out.truncated = true
  return out
}

export function formatInventoryForPrompt(inv: Inventory): string {
  return [
    'Workspace inventory (paths only — use `read_file` to fetch content):',
    '```json',
    JSON.stringify(inv, null, 2),
    '```',
  ].join('\n')
}
