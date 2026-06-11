import type { ReadResult } from '../../lib/fs'
import type { OpenTab, PinnedEntry, EditorGroupId, EditorGroupState } from '../../types/workspace'
import { wsKey } from '../../lib/wsKey'
import { tabKey } from '../../lib/tabKey'

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // quota errors surface via the existing global event channel — best-effort
  }
}

// ---------------------------------------------------------------------------
// Persistence shape
// ---------------------------------------------------------------------------

export interface PersistedGroups {
  version: 1
  groups: { id: EditorGroupId; tabKeys: string[]; activeTabKey: string | null }[]
  activeGroupId: EditorGroupId
}

export function tabKeysFor(group: EditorGroupState): string[] {
  return group.openTabs.map((t) => {
    if (t.kind === 'markdown') return `markdown:${t.relPath}`
    if (t.kind === 'settings') return 'settings'
    if (t.kind === 'extension') return `ext:${t.extensionId}:${t.mode}:${t.relPath}`
    // diff
    return `diff:${t.relPath}@${t.baseRef}`
  })
}

export function persistGroups(rt: string, groups: EditorGroupState[], activeId: EditorGroupId) {
  const payload: PersistedGroups = {
    version: 1,
    groups: groups.map((g) => ({ id: g.id, tabKeys: tabKeysFor(g), activeTabKey: g.activeTabKey })),
    activeGroupId: activeId,
  }
  writeJson(wsKey(rt, 'groups'), payload)
  // Clear the legacy slots once we've written the v1 shape.
  try {
    localStorage.removeItem(wsKey(rt, 'tabs'))
    localStorage.removeItem(wsKey(rt, 'activeTab'))
  } catch { /* ignore */ }
}

export function persistPinnedRels(rt: string, list: PinnedEntry[]) {
  writeJson(wsKey(rt, 'pinned'), list.map((p) => ({ rel: p.relPath })))
}

// ---------------------------------------------------------------------------
// Tab restoration: v1 groups or legacy flat shape
// ---------------------------------------------------------------------------

export type ReadFileFn = (rel: string) => Promise<ReadResult>

export interface DroppedTab {
  rel: string
  reason: 'not-utf8' | 'too-large'
}

export interface RestoredGroups {
  restoredGroups: EditorGroupState[]
  restoredActiveGroupId: EditorGroupId
  droppedTabs: DroppedTab[]
}

/** Parse one persisted tab-key list back into OpenTab[], reading markdown
 * files from disk. Unreadable files are recorded in `droppedTabs`; deleted
 * files are silently skipped. */
async function restoreTabsFromKeys(
  storedKeys: string[],
  readFile: ReadFileFn,
  droppedTabs: DroppedTab[],
): Promise<OpenTab[]> {
  const tabs: OpenTab[] = []
  let settingsRestored = false
  for (const stored of storedKeys) {
    if (stored === 'settings') {
      if (settingsRestored) continue
      tabs.push({ kind: 'settings' })
      settingsRestored = true
      continue
    }
    if (stored.startsWith('diff:')) {
      const inner = stored.slice('diff:'.length)
      const atIdx = inner.lastIndexOf('@')
      if (atIdx >= 1) {
        const relPath = inner.slice(0, atIdx)
        const baseRef = inner.slice(atIdx + 1)
        if (relPath && baseRef) {
          tabs.push({ kind: 'diff', relPath, baseRef })
        }
      }
      continue
    }
    if (stored.startsWith('ext:')) {
      // Format: 'ext:<extensionId>:<mode>:<relPath>'
      const rest = stored.slice('ext:'.length)
      const firstColon = rest.indexOf(':')
      if (firstColon >= 1) {
        const extensionId = rest.slice(0, firstColon)
        const rest2 = rest.slice(firstColon + 1)
        const secondColon = rest2.indexOf(':')
        if (secondColon >= 1) {
          const mode = rest2.slice(0, secondColon) as 'viewer' | 'editor'
          const relPath = rest2.slice(secondColon + 1)
          if (relPath && (mode === 'viewer' || mode === 'editor')) {
            tabs.push({ kind: 'extension', relPath, extensionId, mode })
          }
        }
      }
      continue
    }
    const rel = stored.startsWith('markdown:') ? stored.slice('markdown:'.length) : stored
    try {
      const r = await readFile(rel)
      if (!r.ok) {
        droppedTabs.push({ rel, reason: r.error })
        continue
      }
      tabs.push({
        kind: 'markdown',
        relPath: rel,
        loadedMarkdown: r.content,
        mtimeMs: r.mtimeMs,
        eol: r.eol,
        bom: r.bom,
      })
    } catch {
      // file deleted externally — skip
    }
  }
  return tabs
}

/** Restore editor groups from the persisted v1 shape. */
export async function restoreGroupsV1(
  savedGroups: PersistedGroups,
  readFile: ReadFileFn,
): Promise<RestoredGroups> {
  const droppedTabs: DroppedTab[] = []
  const restoredGroups: EditorGroupState[] = []
  for (const g of savedGroups.groups) {
    const tabs = await restoreTabsFromKeys(g.tabKeys, readFile, droppedTabs)
    const fallbackActive = tabs.length
      ? (g.activeTabKey && tabs.some((t) => tabKey(t) === g.activeTabKey)
          ? g.activeTabKey
          : tabKey(tabs[tabs.length - 1]))
      : null
    restoredGroups.push({ id: g.id, openTabs: tabs, activeTabKey: fallbackActive })
  }
  // Clamp to known group ids and ensure g1 always exists.
  if (!restoredGroups.some((g) => g.id === 'g1')) {
    restoredGroups.unshift({ id: 'g1', openTabs: [], activeTabKey: null })
  }
  const restoredActiveGroupId = restoredGroups.some((g) => g.id === savedGroups.activeGroupId)
    ? savedGroups.activeGroupId
    : 'g1'
  return { restoredGroups, restoredActiveGroupId, droppedTabs }
}

/** Backward-compat: restore editor groups from the legacy 'tabs' / 'activeTab' shape. */
export async function restoreGroupsLegacy(
  savedTabs: string[],
  savedActive: string | null,
  readFile: ReadFileFn,
): Promise<RestoredGroups> {
  const droppedTabs: DroppedTab[] = []
  const tabs = await restoreTabsFromKeys(savedTabs, readFile, droppedTabs)
  const fallbackActive = tabs.length
    ? (savedActive && tabs.some((t) => tabKey(t) === savedActive)
        ? savedActive
        : tabKey(tabs[tabs.length - 1]))
    : null
  const restoredGroups: EditorGroupState[] = [{ id: 'g1', openTabs: tabs, activeTabKey: fallbackActive }]
  return { restoredGroups, restoredActiveGroupId: 'g1', droppedTabs }
}

// ---------------------------------------------------------------------------
// Pinned restoration (supports legacy formats)
// ---------------------------------------------------------------------------

// Legacy format: string[] | {rel, mode?}[] — we now only keep {relPath, mtimeMs}.
export type PersistedPin = string | { rel: string; mode?: string }

export async function restorePinned(
  savedPinnedRaw: PersistedPin[],
  readFile: ReadFileFn,
): Promise<PinnedEntry[]> {
  const restoredPinned: PinnedEntry[] = []
  for (const p of savedPinnedRaw) {
    const rel = typeof p === 'string' ? p : p.rel
    try {
      const file = await readFile(rel)
      if (!file.ok) continue
      restoredPinned.push({ relPath: rel, mtimeMs: file.mtimeMs })
    } catch {
      // skip missing
    }
  }
  return restoredPinned
}
