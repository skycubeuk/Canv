import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'

export interface Command {
  id: string
  label: string
  group?: string
  shortcut?: string
  /** Visibility / runnability predicate. Defaults to always true. */
  when?: () => boolean
  /** When true, the keybinding fires even if focus is inside an input/textarea/contenteditable. */
  runInEditable?: boolean
  run: () => void | Promise<void>
}

export interface UseCommandsApi {
  register: (cmd: Command) => () => void
  list: () => Command[]
  getById: (id: string) => Command | null
  runById: (id: string) => boolean
}

const MOD_ORDER = ['cmd', 'ctrl', 'alt', 'shift'] as const

/** Canonicalise a shortcut string to the form '{cmd}+{ctrl}+{alt}+{shift}+{key}', lowercase. */
export function normaliseShortcut(shortcut: string): string {
  const parts = shortcut.toLowerCase().split('+').map((p) => p.trim()).filter(Boolean)
  const mods = new Set<string>()
  let key = ''
  for (const p of parts) {
    if (p === 'cmd' || p === 'meta' || p === 'super') mods.add('cmd')
    else if (p === 'ctrl' || p === 'control') mods.add('ctrl')
    else if (p === 'alt' || p === 'option') mods.add('alt')
    else if (p === 'shift') mods.add('shift')
    else key = p
  }
  const ordered = MOD_ORDER.filter((m) => mods.has(m))
  return [...ordered, key].filter(Boolean).join('+')
}

function shortcutFromEvent(e: KeyboardEvent): string {
  const mods: string[] = []
  if (e.metaKey) mods.push('cmd')
  if (e.ctrlKey) mods.push('ctrl')
  if (e.altKey) mods.push('alt')
  if (e.shiftKey) mods.push('shift')
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase()
  return [...mods, key].join('+')
}

function targetIsEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return !!target.closest('input, textarea, [contenteditable="true"]')
}

export function useCommands(): UseCommandsApi {
  // Mutable map of registered commands; we use useSyncExternalStore for list snapshots
  // so React renders triggered by registrations stay coherent.
  const commandsRef = useRef<Map<string, Command>>(new Map())
  const listenersRef = useRef<Set<() => void>>(new Set())
  const snapshotRef = useRef<Command[]>([])

  const notify = useCallback(() => {
    snapshotRef.current = Array.from(commandsRef.current.values())
    for (const fn of listenersRef.current) fn()
  }, [])

  const register = useCallback((cmd: Command): (() => void) => {
    if (commandsRef.current.has(cmd.id)) {
      // Replace existing — silently allow overrides (e.g. profile-aware commands).
    }
    commandsRef.current.set(cmd.id, cmd)
    notify()
    return () => {
      const current = commandsRef.current.get(cmd.id)
      if (current === cmd) {
        commandsRef.current.delete(cmd.id)
        notify()
      }
    }
  }, [notify])

  const subscribe = useCallback((fn: () => void) => {
    listenersRef.current.add(fn)
    return () => { listenersRef.current.delete(fn) }
  }, [])

  const getSnapshot = useCallback(() => snapshotRef.current, [])

  // Force the list selector to reactively re-derive when commands change.
  useSyncExternalStore(subscribe, getSnapshot)

  const list = useCallback((): Command[] => {
    return snapshotRef.current.filter((c) => (c.when ? c.when() : true))
  }, [])

  const getById = useCallback((id: string): Command | null => {
    return commandsRef.current.get(id) ?? null
  }, [])

  const runById = useCallback((id: string): boolean => {
    const cmd = commandsRef.current.get(id)
    if (!cmd) return false
    if (cmd.when && !cmd.when()) return false
    void cmd.run()
    return true
  }, [])

  // Global keydown dispatch.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const sig = shortcutFromEvent(e)
      let matched: Command | null = null
      for (const cmd of commandsRef.current.values()) {
        if (!cmd.shortcut) continue
        if (normaliseShortcut(cmd.shortcut) !== sig) continue
        if (cmd.when && !cmd.when()) continue
        matched = cmd
        break
      }
      if (!matched) return
      if (!matched.runInEditable && targetIsEditable(e.target)) return
      e.preventDefault()
      void matched.run()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return useMemo<UseCommandsApi>(() => ({ register, list, getById, runById }), [register, list, getById, runById])
}
