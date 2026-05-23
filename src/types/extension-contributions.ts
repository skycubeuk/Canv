// src/types/extension-contributions.ts
import type {
  PanelLocation, FileHandlerMode, StatusBarAlignment,
} from './extension-settings'

export interface PanelRecord {
  extensionId: string
  id: string
  title: string
  icon: string
  location: PanelLocation
  entry: string
}

export interface FileHandlerRecord {
  extensionId: string
  id: string
  extensions: string[]
  mode: FileHandlerMode
  entry: string
}

export interface CommandRecord {
  extensionId: string
  extensionName: string         // for palette subtitle
  id: string
  title: string
  entry: string
  keybinding?: string
}

export interface MenuRecord {
  extensionId: string
  menu: string
  command: string
  title?: string
  when?: string
}

export interface StatusBarRecord {
  extensionId: string
  id: string
  alignment: StatusBarAlignment
  priority: number
  text?: string
  icon?: string
  tooltip?: string
  command?: string
}

export interface LanguageRecord {
  extensionId: string
  extensions: string[]
  entry: string
}

export interface AllContributions {
  panels: PanelRecord[]
  fileHandlers: FileHandlerRecord[]
  commands: CommandRecord[]
  menus: MenuRecord[]
  statusBarItems: StatusBarRecord[]
  languages: LanguageRecord[]
}
