import { useCallback, useEffect, useMemo, useState } from 'react'
import { fuzzySort } from '../lib/fuzzy'
import type { Command } from './useCommands'
import type { CommandRecord } from '../types/extension-contributions'
import type { PaletteFile, QuickPickMode } from '../types/quick-pick'

export interface QuickPickRow {
  kind: 'command' | 'file' | 'recent' | 'extensionCommand'
  label: string
  detail: string
  shortcut?: string
  payload: {
    command?: Command
    file?: PaletteFile
    extensionCommand?: CommandRecord
  }
}

export interface UseQuickPickArgs {
  query: string
  commands: Command[]
  files: PaletteFile[]
  recentFiles: PaletteFile[]
  extensionCommands?: CommandRecord[]
  onRunCommand: (id: string) => void
  onOpenFile: (rel: string) => void
  onInvokeExtensionCommand?: (id: string) => void
  onClose: () => void
}

export interface UseQuickPickResult {
  mode: QuickPickMode
  rows: QuickPickRow[]
  highlight: number
  setHighlight: (i: number) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  activate: (i: number) => void
}

function rowsForCommands(commands: Command[], q: string): QuickPickRow[] {
  const ranked = fuzzySort(q, commands, (c) => c.label)
  return ranked.map(({ item: c }) => ({
    kind: 'command' as const,
    label: c.label,
    detail: c.group ?? '',
    shortcut: c.shortcut,
    payload: { command: c },
  }))
}

function rowsForExtensionCommands(cmds: CommandRecord[], q: string): QuickPickRow[] {
  const ranked = fuzzySort(q, cmds, (c) => c.title)
  return ranked.map(({ item: c }) => ({
    kind: 'extensionCommand' as const,
    label: c.title,
    detail: c.extensionName,
    shortcut: c.keybinding,
    payload: { extensionCommand: c },
  }))
}

function rowsForFiles(
  files: PaletteFile[],
  q: string,
  recents: PaletteFile[],
): QuickPickRow[] {
  if (!q) {
    return recents.slice(0, 30).map((f) => ({
      kind: 'recent' as const,
      label: f.basename,
      detail: f.rel,
      payload: { file: f },
    }))
  }
  const ranked = fuzzySort(q, files, (f) => f.rel)
  return ranked.slice(0, 50).map(({ item: f }) => ({
    kind: 'file' as const,
    label: f.basename,
    detail: f.rel,
    payload: { file: f },
  }))
}

export function useQuickPick(args: UseQuickPickArgs): UseQuickPickResult {
  const {
    query,
    commands,
    files,
    recentFiles,
    extensionCommands,
    onRunCommand,
    onOpenFile,
    onInvokeExtensionCommand,
    onClose,
  } = args

  const isFiles = query.startsWith('@')
  const mode: QuickPickMode = isFiles ? 'files' : 'commands'
  const effectiveQuery = isFiles ? query.slice(1).trim() : query.trim()

  const rows = useMemo<QuickPickRow[]>(() => {
    if (mode === 'commands') {
      const native = rowsForCommands(commands, effectiveQuery)
      const ext = extensionCommands
        ? rowsForExtensionCommands(extensionCommands, effectiveQuery)
        : []
      return [...native, ...ext]
    }
    return rowsForFiles(files, effectiveQuery, recentFiles)
  }, [mode, effectiveQuery, commands, files, recentFiles, extensionCommands])

  const [highlight, setHighlight] = useState(0)

  // Reset highlight whenever mode or effective query changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors usePaletteContent.ts pattern: functional state-on-input-change
    setHighlight(0)
  }, [mode, effectiveQuery])

  const activate = useCallback(
    (index: number) => {
      const row = rows[index]
      if (!row) return
      if (row.payload.command) {
        onRunCommand(row.payload.command.id)
        onClose()
        return
      }
      if (row.payload.extensionCommand) {
        onInvokeExtensionCommand?.(row.payload.extensionCommand.id)
        onClose()
        return
      }
      if (row.payload.file) {
        onOpenFile(row.payload.file.rel)
        onClose()
        return
      }
    },
    [rows, onRunCommand, onInvokeExtensionCommand, onOpenFile, onClose],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => Math.min(h + 1, Math.max(rows.length - 1, 0)))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => Math.max(h - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        activate(highlight)
      }
    },
    [rows.length, activate, highlight, onClose],
  )

  return { mode, rows, highlight, setHighlight, onKeyDown, activate }
}
