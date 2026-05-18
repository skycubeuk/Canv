import { useEffect, useState, useCallback } from 'react'
import type { AllContributions } from '../types/extension-contributions'

const EMPTY: AllContributions = {
  panels: [], fileHandlers: [], commands: [], menus: [], statusBarItems: [], languages: [],
}

export function useContributions(): AllContributions {
  const [contributions, setContributions] = useState<AllContributions>(EMPTY)

  const refetch = useCallback(async () => {
    const dev = window.canvExtensions
    if (!dev) { setContributions(EMPTY); return }
    try {
      const all = await dev.readAllContributions()
      setContributions(all)
    } catch {
      setContributions(EMPTY)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async refetch defers setState to a microtask
    void refetch()
    const offChanged = window.canvExtensions?.onChanged(() => { void refetch() })
    const offCrashed = window.canvExtensions?.onCrashed(() => { void refetch() })
    const offStatusBar = (window.canvExtensions as { onStatusBarChanged?: (cb: () => void) => () => void } | undefined)
      ?.onStatusBarChanged?.(() => { void refetch() })
    return () => { offChanged?.(); offCrashed?.(); offStatusBar?.() }
  }, [refetch])

  return contributions
}
