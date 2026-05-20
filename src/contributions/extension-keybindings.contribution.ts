import { DisposableStore, toDisposable } from '../lib/lifecycle'
import type { CommandRecord } from '../types/extension-contributions'
import { registerContribution, type Contribution } from './index'

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

/**
 * Register document-level keybindings for extension commands. The hook this
 * replaces re-ran whenever `contributions.commands` changed; here the same
 * effect is achieved because `useContributions` returns a new object on every
 * refetch, which re-keys the `services` identity in <Contributions /> and
 * triggers re-registration.
 */
export const extensionKeybindings: Contribution = {
  name: 'extension-keybindings',
  register(services) {
    const store = new DisposableStore()
    const commands: CommandRecord[] = services.contributions.commands

    const bindings = commands
      .filter((c) => c.keybinding)
      .map((c) => ({ cmd: c, parsed: parseKeybinding(c.keybinding!) }))
      .filter((b): b is { cmd: CommandRecord; parsed: NonNullable<ReturnType<typeof parseKeybinding>> } => b.parsed !== null)
    if (bindings.length === 0) return store

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
    store.add(toDisposable(() => document.removeEventListener('keydown', onKey)))
    return store
  },
}

registerContribution(extensionKeybindings)
