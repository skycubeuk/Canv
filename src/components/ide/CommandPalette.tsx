import { useMemo, useRef, useState } from 'react'
import { fuzzySort } from '../../lib/fuzzy'
import type { Command } from '../../hooks/useCommands'

export type PaletteMode = 'commands' | 'files'

export interface PaletteFile {
  rel: string
  basename: string
}

interface Props {
  open: boolean
  mode: PaletteMode
  commands: Command[]
  files: PaletteFile[]
  recentFiles: PaletteFile[]
  onClose: () => void
  onRunCommand: (id: string) => void
  onOpenFile: (rel: string) => void
}

interface Row {
  kind: 'command' | 'file' | 'recent'
  label: string
  detail: string
  shortcut?: string
  payload: { command?: Command; file?: PaletteFile }
}

function rowsForCommands(commands: Command[], q: string): Row[] {
  const ranked = fuzzySort(q, commands, (c) => c.label)
  return ranked.map(({ item: c }) => ({
    kind: 'command' as const,
    label: c.label,
    detail: c.group ?? '',
    shortcut: c.shortcut,
    payload: { command: c },
  }))
}

function rowsForFiles(files: PaletteFile[], q: string, recents: PaletteFile[]): Row[] {
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

export function CommandPalette(props: Props) {
  if (!props.open) return null
  // Re-mount the inner panel whenever mode flips so its useState initialisers run
  // afresh — no setState-in-effect needed for "reset on open / mode change".
  return <PalettePanel key={props.mode} {...props} />
}

function PalettePanel(props: Props) {
  const { mode, commands, files, recentFiles, onClose, onRunCommand, onOpenFile } = props
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  // Autofocus the input on first paint without an effect: the ref callback fires
  // once when the input is attached.
  const focusedRef = useRef(false)
  const inputRef = (el: HTMLInputElement | null) => {
    if (el && !focusedRef.current) {
      focusedRef.current = true
      el.focus()
    }
  }

  const rows = useMemo<Row[]>(() => {
    return mode === 'commands' ? rowsForCommands(commands, query) : rowsForFiles(files, query, recentFiles)
  }, [mode, query, commands, files, recentFiles])

  function activate(index: number) {
    const row = rows[index]
    if (!row) return
    if (row.payload.command) {
      onRunCommand(row.payload.command.id)
      onClose()
      return
    }
    if (row.payload.file) {
      onOpenFile(row.payload.file.rel)
      onClose()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
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
  }

  return (
    <div
      role="dialog"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/30"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-elev rounded-lg shadow-2xl border border-default overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setHighlight(0) }}
          onKeyDown={handleKeyDown}
          placeholder={mode === 'commands' ? 'Type a command…' : 'Open a file by name…'}
          className="w-full px-4 py-3 text-sm bg-transparent border-b border-default focus:outline-hidden"
        />
        <ul className="max-h-[50vh] overflow-y-auto py-1" role="listbox">
          {rows.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted">No matches.</li>
          )}
          {rows.map((row, i) => {
            const isActive = i === highlight
            return (
              <li
                key={`${row.kind}:${row.label}:${row.detail}:${i}`}
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => activate(i)}
                className={`px-4 py-2 cursor-pointer flex items-center gap-3 ${
                  isActive
                    ? 'bg-active'
                    : 'hover:bg-hover'
                }`}
              >
                <span className="text-sm flex-1 truncate">{row.label}</span>
                {row.detail && (
                  <span className="text-xs text-muted truncate max-w-[40%]">{row.detail}</span>
                )}
                {row.shortcut && (
                  <kbd className="text-[10px] px-1.5 py-0.5 rounded-sm border border-default text-muted">
                    {row.shortcut}
                  </kbd>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
