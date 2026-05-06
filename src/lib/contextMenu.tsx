import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ContextMenu } from '../components/ContextMenu'

export type ContextMenuItem =
  | { id: string; label: string; onClick: () => void; disabled?: boolean }
  | { separator: true }

export interface ContextMenuController {
  open: (event: React.MouseEvent | MouseEvent, items: ContextMenuItem[]) => void
  close: () => void
  isOpen: boolean
}

interface MenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

const ContextMenuCtx = createContext<ContextMenuController | null>(null)

// eslint-disable-next-line react-refresh/only-export-components -- co-locating the hook with the provider keeps usage in a single import; HMR cost is negligible for this leaf module.
export function useContextMenu(): ContextMenuController {
  const ctx = useContext(ContextMenuCtx)
  if (!ctx) throw new Error('useContextMenu must be used inside <ContextMenuProvider>')
  return ctx
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MenuState | null>(null)

  const open = useCallback((event: React.MouseEvent | MouseEvent, items: ContextMenuItem[]) => {
    event.preventDefault()
    const x = 'clientX' in event ? event.clientX : 0
    const y = 'clientY' in event ? event.clientY : 0
    setState({ x, y, items })
  }, [])

  const close = useCallback(() => setState(null), [])

  const value = useMemo<ContextMenuController>(() => ({
    open,
    close,
    isOpen: state !== null,
  }), [open, close, state])

  return (
    <ContextMenuCtx.Provider value={value}>
      {children}
      {state && (
        <ContextMenu x={state.x} y={state.y} items={state.items} onClose={close} />
      )}
    </ContextMenuCtx.Provider>
  )
}
