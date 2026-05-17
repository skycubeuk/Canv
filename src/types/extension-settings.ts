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
