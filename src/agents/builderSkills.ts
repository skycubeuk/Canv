import type { ToolSchema } from '../adapters/types'
import introRaw from './extension-docs/_intro.md?raw'
import panelRaw from './extension-docs/panel.md?raw'
import fileHandlerRaw from './extension-docs/fileHandler.md?raw'
import commandRaw from './extension-docs/command.md?raw'
import menuRaw from './extension-docs/menu.md?raw'
import statusBarRaw from './extension-docs/statusBar.md?raw'
import languageRaw from './extension-docs/language.md?raw'
import manifestFullRaw from './extension-docs/manifest-full.md?raw'
import canvApiFullRaw from './extension-docs/canv-api-full.md?raw'

const EMPTY_SCHEMA = { type: 'object' as const, properties: {}, required: [] as string[] }

export const BUILDER_SKILLS: ToolSchema[] = [
  {
    name: 'learn_panel',
    description:
      'Use when emitting a sidebar (left-sidebar) or bottom-dock panel contribution. Returns the panel manifest schema, the canv.* methods commonly used inside panels, and a minimal example.',
    inputSchema: EMPTY_SCHEMA,
  },
  {
    name: 'learn_fileHandler',
    description:
      'Use when emitting an extension that opens a non-text file type (PDF, image, EPUB, etc.) in the editor area. Returns viewer-vs-editor mode docs, the getBytes/setBytes API, and the activeFile.changed event.',
    inputSchema: EMPTY_SCHEMA,
  },
  {
    name: 'learn_command',
    description:
      'Use when emitting a command contribution that appears in the command palette and/or has a keybinding. Returns the command manifest schema and the canv.commands.onInvoke handler contract.',
    inputSchema: EMPTY_SCHEMA,
  },
  {
    name: 'learn_menu',
    description:
      'Use when adding items to the file-tree right-click menu. Returns the menu manifest schema, the when-clause grammar (fileExt, isDir, isFile), and how the command receives the right-clicked file path.',
    inputSchema: EMPTY_SCHEMA,
  },
  {
    name: 'learn_statusBar',
    description:
      'Use when adding native status-bar items. Returns the two-zone priority model, the declarative manifest fields, and the canv.ui.setStatusBarItem live-update API.',
    inputSchema: EMPTY_SCHEMA,
  },
  {
    name: 'learn_language',
    description:
      'Use ONLY when the user explicitly asks for syntax highlighting of a specific file type. WARNING: language extensions trigger a separate red install prompt because they run with full main-renderer privileges. Do not emit a language contribution unless clearly requested.',
    inputSchema: EMPTY_SCHEMA,
  },
  {
    name: 'learn_manifest_full',
    description:
      'Use when emitting a manifest with an unusual combination of fields or for the complete schema reference (settings, activationEvents, secret settings, etc.).',
    inputSchema: EMPTY_SCHEMA,
  },
  {
    name: 'learn_canv_api_full',
    description:
      'Use when emitting code that calls multiple canv.* methods and you need the full API + capability mapping reference.',
    inputSchema: EMPTY_SCHEMA,
  },
]

const SKILL_BODIES: Record<string, string> = {
  learn_panel: panelRaw,
  learn_fileHandler: fileHandlerRaw,
  learn_command: commandRaw,
  learn_menu: menuRaw,
  learn_statusBar: statusBarRaw,
  learn_language: languageRaw,
  learn_manifest_full: manifestFullRaw,
  learn_canv_api_full: canvApiFullRaw,
}

export function skillBody(name: string): string {
  const body = SKILL_BODIES[name]
  if (!body) return `Unknown skill: ${name}`
  return `${introRaw}\n\n---\n\n${body}`
}

export const BUILDER_MAX_TOOL_ROUNDS = 4
