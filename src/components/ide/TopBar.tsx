import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, PanelRight, PanelBottom } from 'lucide-react'
import type { InAppDockPlacement } from '../../hooks/useIdeLayout'
import { useQuickPick } from '../../hooks/useQuickPick'
import type { Command } from '../../hooks/useCommands'
import type { PaletteFile } from '../../types/quick-pick'
import type { CommandRecord } from '../../types/extension-contributions'

interface Props {
  workspaceName: string | null
  bottomVisible: boolean
  bottomPlacement: InAppDockPlacement | 'popout'
  onSetBottomPlacementBottom: () => void
  onSetBottomPlacementRight: () => void
  commands: Command[]
  files: PaletteFile[]
  recentFiles: PaletteFile[]
  extensionCommands: CommandRecord[]
  onRunCommand: (id: string) => void
  onOpenFile: (rel: string) => void
  onInvokeExtensionCommand: (id: string) => void
}

const IS_MAC =
  typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac')

const SHORTCUT_HINT = IS_MAC ? '⌘⇧P' : 'Ctrl+Shift+P'

export function TopBar(props: Props) {
  const {
    workspaceName,
    bottomVisible, bottomPlacement,
    onSetBottomPlacementBottom, onSetBottomPlacementRight,
    commands, files, recentFiles, extensionCommands,
    onRunCommand, onOpenFile, onInvokeExtensionCommand,
  } = props

  const displayName = workspaceName
    ? (workspaceName.split(/[\\/]/).filter(Boolean).pop() ?? workspaceName)
    : null

  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  // The dropdown opens only when the user has expressed intent: typing into
  // the bar or invoking it via the keyboard shortcut. Incidental focus (a
  // stray click on the bar, Electron's window-level focus restoration, etc.)
  // must NOT pop the dropdown. The flag clears on close so the next focus
  // cycle starts clean.
  const [intent, setIntent] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  const close = useCallback(() => {
    setQuery('')
    setFocused(false)
    setIntent(false)
    inputRef.current?.blur()
  }, [])

  const { mode, rows, highlight, setHighlight, onKeyDown, activate } = useQuickPick({
    query,
    commands,
    files,
    recentFiles,
    extensionCommands,
    onRunCommand,
    onOpenFile,
    onInvokeExtensionCommand,
    onClose: close,
  })

  useEffect(() => {
    const onFocus = (e: Event) => {
      const detail = (e as CustomEvent<{ prefill?: string }>).detail
      const prefill = detail?.prefill ?? ''
      setQuery(prefill)
      setIntent(true)
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener('canv:topbar:focus', onFocus)
    return () => window.removeEventListener('canv:topbar:focus', onFocus)
  }, [])

  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null)
  useLayoutEffect(() => {
    if (!focused) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on blur; the popover must close synchronously to avoid stale-anchor flicker
      setAnchor(null)
      return
    }
    const update = () => {
      const el = inputRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setAnchor({ left: r.left, top: r.bottom + 4, width: r.width })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [focused])

  useEffect(() => {
    if (!focused) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null
      if (!t) return
      if (inputRef.current?.contains(t)) return
      if (dropdownRef.current?.contains(t)) return
      close()
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [focused, close])

  const placeholder = mode === 'files' ? 'Open a document…' : 'Type a command…'
  const showDropdown = focused && intent && anchor !== null

  return (
    <header
      role="banner"
      className="topbar-chrome relative shrink-0 h-10 flex items-center gap-1.5 bg-panel border-b border-default text-[12px]"
    >
      <div className="flex items-center gap-2 pr-2">
        <span
          aria-hidden
          className="accent-gradient w-[18px] h-[18px] rounded-[5px] grid place-items-center text-accent-fg font-bold text-[10px]"
        >
          C
        </span>
        <span className="font-medium text-default">Canv</span>
        <span aria-hidden className="text-subtle">·</span>
        <span className="text-muted truncate max-w-[180px]" title={workspaceName ?? ''}>
          {displayName || 'No workspace'}
        </span>
      </div>

      <div className="flex-1" />

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center w-[44vw] min-w-[280px] max-w-[600px]">
        <Search
          aria-hidden
          className="absolute left-2.5 w-3 h-3 text-muted pointer-events-none"
        />
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder={placeholder}
          onChange={(e) => { setQuery(e.target.value); setIntent(true) }}
          onMouseDown={() => setIntent(true)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); setIntent(false) }}
          onKeyDown={onKeyDown}
          aria-label="Command palette"
          className="w-full pl-7 pr-14 py-1 bg-elev border border-default rounded-md text-default placeholder:text-muted focus:outline-hidden focus:ring-1 focus:ring-accent"
        />
        <span className="absolute right-2 text-[10px] px-1.5 py-px rounded-sm bg-app border border-default font-mono text-subtle pointer-events-none">
          {SHORTCUT_HINT}
        </span>
      </div>

      {showDropdown && createPortal(
        <div
          ref={dropdownRef}
          role="listbox"
          aria-label="Command palette results"
          style={{
            position: 'fixed',
            left: anchor.left,
            top: anchor.top,
            width: anchor.width,
            zIndex: 50,
          }}
          className="bg-elev rounded-md shadow-2xl border border-default overflow-hidden"
          onMouseDown={(e) => e.preventDefault()}
        >
          <ul className="max-h-[50vh] overflow-y-auto py-1">
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
                    isActive ? 'bg-active' : 'hover:bg-hover'
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
        </div>,
        document.body,
      )}

      <div className="flex-1" />

      <button
        type="button"
        aria-label="Panel right (dock to right)"
        aria-pressed={bottomVisible && bottomPlacement === 'right'}
        onClick={onSetBottomPlacementRight}
        className={`w-7 h-7 grid place-items-center rounded-md ${
          bottomVisible && bottomPlacement === 'right' ? 'bg-active text-default' : 'text-muted hover:bg-hover'
        }`}
      >
        <PanelRight aria-hidden className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        aria-label="Panel bottom (dock to bottom)"
        aria-pressed={bottomVisible && bottomPlacement === 'bottom'}
        onClick={onSetBottomPlacementBottom}
        className={`w-7 h-7 grid place-items-center rounded-md ${
          bottomVisible && bottomPlacement === 'bottom' ? 'bg-active text-default' : 'text-muted hover:bg-hover'
        }`}
      >
        <PanelBottom aria-hidden className="w-3.5 h-3.5" />
      </button>
    </header>
  )
}
