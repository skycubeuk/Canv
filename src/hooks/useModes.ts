import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react'
import { loadModes } from '../config/loader'
import type { Mode, ConfigError } from '../config/types'

export type ModesState =
  | { status: 'loading' }
  | { status: 'ready'; modes: Mode[]; defaultModeId: string }
  | { status: 'error'; errors: ConfigError[]; configDir?: string }

const ModesContext = createContext<ModesState>({ status: 'loading' })

export function ModesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ModesState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    loadModes()
      .then((result) => {
        if (cancelled) return
        if (!result.ok) {
          setState({ status: 'error', errors: result.errors, configDir: result.configDir })
          return
        }
        const def = result.modes.find((m) => m.default) ?? result.modes[0]
        setState({ status: 'ready', modes: result.modes, defaultModeId: def.id })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        setState({
          status: 'error',
          errors: [{ file: '', field: '', message: `Failed to load config: ${message}` }],
        })
      })
    return () => { cancelled = true }
  }, [])

  return createElement(ModesContext.Provider, { value: state }, children)
}

/** Returns the loaded mode list. Throws if called before modes are ready. */
export function useModes(): { modes: Mode[]; defaultModeId: string } {
  const state = useContext(ModesContext)
  if (state.status !== 'ready') {
    throw new Error('useModes() called before modes are loaded — wrap children in <ModesGate>')
  }
  return { modes: state.modes, defaultModeId: state.defaultModeId }
}

/** Raw context state — for the boot gate that decides loading/error/ready. */
export function useModesState(): ModesState {
  return useContext(ModesContext)
}

export function getModeById(modes: Mode[], id: string | null | undefined): Mode | undefined {
  if (!id) return undefined
  return modes.find((m) => m.id === id)
}

export function getActionById(mode: Mode, id: string): import('../config/types').Action | undefined {
  return mode.actions.find((a) => a.id === id)
}
