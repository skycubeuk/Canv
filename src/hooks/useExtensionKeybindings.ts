import { useEffect } from 'react'
import type { CommandRecord } from '../types/extension-contributions'

function parseKeybinding(kb: string): { ctrl: boolean; meta: boolean; alt: boolean; shift: boolean; key: string } | null {
  const parts = kb.split('+').map((p) => p.trim())
  const key = parts[parts.length - 1]
  if (!key) return null
  const mods = new Set(parts.slice(0, -1).map((m) => m.toLowerCase()))
  const isMac = navigator.userAgent.includes('Mac')
  return {
    ctrl: mods.has('ctrl') || (mods.has('cmdorctrl') && !isMac),
    meta: mods.has('cmd') || mods.has('meta') || (mods.has('cmdorctrl') && isMac),
    alt: mods.has('alt'),
    shift: mods.has('shift'),
    key: key.toUpperCase(),
  }
}

export function useExtensionKeybindings(commands: CommandRecord[]) {
  useEffect(() => {
    const bindings = commands
      .filter((c) => c.keybinding)
      .map((c) => ({ cmd: c, parsed: parseKeybinding(c.keybinding!) }))
      .filter((b): b is { cmd: CommandRecord; parsed: NonNullable<ReturnType<typeof parseKeybinding>> } => b.parsed !== null)
    if (bindings.length === 0) return

    const onKey = (e: KeyboardEvent) => {
      for (const b of bindings) {
        if (b.parsed.ctrl !== e.ctrlKey) continue
        if (b.parsed.meta !== e.metaKey) continue
        if (b.parsed.alt !== e.altKey) continue
        if (b.parsed.shift !== e.shiftKey) continue
        if (b.parsed.key !== e.key.toUpperCase()) continue
        e.preventDefault()
        void window.canvExtensions?.invokeCommand?.(b.cmd.id)
        return
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [commands])
}
