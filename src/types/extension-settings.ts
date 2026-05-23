export type SettingDef =
  | { key: string; type: 'string'; default?: string; label?: string; description?: string; max?: number }
  | { key: string; type: 'number'; default?: number; label?: string; description?: string; min?: number; max?: number; step?: number }
  | { key: string; type: 'boolean'; default?: boolean; label?: string; description?: string }
  | { key: string; type: 'enum'; options: string[]; default?: string; label?: string; description?: string }
  | { key: string; type: 'color'; default?: string; label?: string; description?: string }
  | { key: string; type: 'multiline'; default?: string; label?: string; description?: string }
  | { key: string; type: 'path'; default?: string; label?: string; description?: string }

export type ActivationEvent =
  | 'onStartup'
  | `onCommand:${string}`
  | `onPanelOpen:${string}:${string}`

export interface MigrationStep {
  from: string                 // semver of previous extension version
  rename?: Record<string, string>  // oldKey → newKey
  drop?: string[]              // keys to delete entirely
}

export interface RegistryEntry {
  id: string
  enabled: boolean
  trustedAt: string | null     // ISO timestamp; null = untrusted, never spawn
  manifestSha256: string
  installedAt: string
  version: string              // copy of manifest.version, for diffs after manifest edits
}

export interface RegistryFile {
  version: 1
  extensions: RegistryEntry[]
}

export type TrustState = 'trusted' | 'untrusted' | 'always-disabled'

export interface TrustedWorkspacesFile {
  version: 1
  workspaces: Record<string, { state: TrustState; updatedAt: string }>  // absolute workspace path → state
}

// Phase 5 contribution types
export type PanelLocation = 'left-sidebar' | 'bottom-dock'
export type FileHandlerMode = 'viewer' | 'editor'
export type StatusBarAlignment = 'left' | 'right'

export interface PanelContribution {
  type: 'panel'
  id: string
  title: string
  icon: string
  location: PanelLocation
  entry: string
}

export interface FileHandlerContribution {
  type: 'fileHandler'
  id: string
  extensions: string[]
  mode: FileHandlerMode
  entry: string
}

export interface CommandContribution {
  type: 'command'
  id: string
  title: string
  entry: string
  keybinding?: string
}

export interface MenuContribution {
  type: 'menu'
  menu: 'fileTree.context'
  command: string
  title?: string
  when?: string
}

export interface StatusBarContribution {
  type: 'statusBar'
  id: string
  alignment: StatusBarAlignment
  priority: number
  text?: string
  icon?: string
  tooltip?: string
  command?: string
}

export interface LanguageContribution {
  type: 'language'
  extensions: string[]
  entry: string
}

export type ContributionV5 =
  | PanelContribution
  | FileHandlerContribution
  | CommandContribution
  | MenuContribution
  | StatusBarContribution
  | LanguageContribution
