import type { SettingDef, ActivationEvent, MigrationStep } from './extension-settings'

export type CapabilityString =
  | 'activeDoc.read'
  | 'activeDoc.write'
  | 'workspace.list'
  | 'workspace.read'
  | 'workspace.write'         // declared for Phase 2; rejected in Phase 1
  | 'selection.read'
  | 'selection.write'
  | 'events.docChanged'
  | 'events.selectionChanged'
  | 'events.docSaved'
  | 'events.workspaceChanged'
  | 'storage'
  | 'settings'                // declared for Phase 2
  | 'ai'                      // declared for Phase 2
  | 'notify'
  | 'ui'

export type ContributionType =
  | 'panel'
  | 'fileHandler'
  | 'language'
  | 'editor'
  | 'command'
  | 'menu'
  | 'statusBar'

export interface PanelContribution {
  type: 'panel'
  id: string
  title: string
  icon: string
  location: 'right-sidebar' | 'left-sidebar' | 'bottom-dock'
  entry: string
}

export type Contribution = PanelContribution
// Other contribution types are added in Phase 4; Phase 1 only validates `panel`.

export interface ExtensionManifest {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  createdAt?: string
  builderPrompt?: string
  capabilities: CapabilityString[]
  network?: string[]
  contributions: Contribution[]
  settings?: SettingDef[]
  activationEvents?: ActivationEvent[]
  migrations?: MigrationStep[]
}

export interface ActiveDocSnapshot {
  path: string | null
  text: string
  selection: { from: number; to: number; text: string }
}

export interface CanvEvent {
  type: 'activeDocChanged' | 'selectionChanged' | 'docSaved' | 'workspaceChanged'
  payload: unknown
}
