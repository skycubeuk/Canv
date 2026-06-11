import type { EditorGroupId, EditorGroupState } from '../../types/workspace'
import { tabKey } from '../../lib/tabKey'

export function isMd(rel: string): boolean {
  const lower = rel.toLowerCase()
  return lower.endsWith('.md') || lower.endsWith('.markdown')
}

// ---------------------------------------------------------------------------
// Per-group helpers (pure functions, no React deps)
// ---------------------------------------------------------------------------

export function findGroup(groups: EditorGroupState[], id: EditorGroupId): EditorGroupState | null {
  return groups.find((g) => g.id === id) ?? null
}

export function findGroupContaining(groups: EditorGroupState[], key: string): EditorGroupState | null {
  for (const g of groups) {
    if (g.openTabs.some((t) => tabKey(t) === key)) return g
  }
  return null
}

export function withGroupUpdate(
  groups: EditorGroupState[],
  id: EditorGroupId,
  updater: (g: EditorGroupState) => EditorGroupState,
): EditorGroupState[] {
  return groups.map((g) => (g.id === id ? updater(g) : g))
}
