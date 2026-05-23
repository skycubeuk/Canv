import type { OpenTab } from '../types/workspace'

export const SETTINGS_TAB_KEY = '__settings__'
export const DIFF_TAB_KEY_PREFIX = 'diff:'
export const EXTENSION_TAB_KEY_PREFIX = 'ext:'

/** Canonical key for a tab. Diff tabs use 'diff:<rel>@<baseRef>'. Extension tabs use 'ext:<extensionId>:<rel>'. */
export function tabKey(tab: OpenTab): string {
  if (tab.kind === 'markdown') return tab.relPath
  if (tab.kind === 'settings') return SETTINGS_TAB_KEY
  if (tab.kind === 'extension') return `${EXTENSION_TAB_KEY_PREFIX}${tab.extensionId}:${tab.relPath}`
  // diff
  return `${DIFF_TAB_KEY_PREFIX}${tab.relPath}@${tab.baseRef}`
}

export function isMarkdownTab(
  tab: OpenTab,
): tab is Extract<OpenTab, { kind: 'markdown' }> {
  return tab.kind === 'markdown'
}

export function isSettingsTab(
  tab: OpenTab,
): tab is Extract<OpenTab, { kind: 'settings' }> {
  return tab.kind === 'settings'
}

export function isDiffTab(
  tab: OpenTab,
): tab is Extract<OpenTab, { kind: 'diff' }> {
  return tab.kind === 'diff'
}

export function isExtensionTab(
  tab: OpenTab,
): tab is Extract<OpenTab, { kind: 'extension' }> {
  return tab.kind === 'extension'
}

/**
 * Parse a persisted tab key back into an OpenTab stub.
 * Returns null when the key is unrecognised (forward-compat).
 */
export function parseTabKey(key: string): OpenTab | null {
  if (key === SETTINGS_TAB_KEY) return { kind: 'settings' }
  if (key.startsWith(DIFF_TAB_KEY_PREFIX)) {
    // Format: 'diff:<rel>@<baseRef>'
    const inner = key.slice(DIFF_TAB_KEY_PREFIX.length) // '<rel>@<baseRef>'
    const atIdx = inner.lastIndexOf('@')
    if (atIdx < 1) return null // malformed
    const relPath = inner.slice(0, atIdx)
    const baseRef = inner.slice(atIdx + 1)
    if (!relPath || !baseRef) return null
    return { kind: 'diff', relPath, baseRef }
  }
  if (key.startsWith('markdown:')) return null // caller handles markdown: prefix separately
  // Legacy: bare relPath (no prefix) = markdown
  return null
}

/** Parse a serialised diff tab key (e.g. 'diff:notes/x.md@HEAD') into its parts, or null if not a diff key. */
export function parseDiffKey(key: string): { relPath: string; baseRef: string } | null {
  if (!key.startsWith(DIFF_TAB_KEY_PREFIX)) return null
  const rest = key.slice(DIFF_TAB_KEY_PREFIX.length)
  const at = rest.lastIndexOf('@')
  if (at < 0) return null
  return { relPath: rest.slice(0, at), baseRef: rest.slice(at + 1) }
}
