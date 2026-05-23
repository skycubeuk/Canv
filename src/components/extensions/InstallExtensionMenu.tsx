import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { SidebarIconButton } from '../ide/sidebar/SidebarChrome'

interface Props {
  onFromFolder: () => void
  onFromFile: () => void
}

export function InstallExtensionMenu({ onFromFolder, onFromFile }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!(e.target instanceof Node)) return
      if (triggerRef.current && triggerRef.current.contains(e.target)) return
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative">
      <div ref={triggerRef}>
        <SidebarIconButton
          aria-label="Install extension"
          title="Install extension"
          icon={Plus}
          onClick={() => setOpen((v) => !v)}
        />
      </div>
      {open && (
        <div
          ref={ref}
          role="menu"
          className="absolute right-0 top-full z-30 bg-elev border border-default rounded-sm shadow-lg p-1 min-w-[180px]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onFromFolder() }}
            className="block w-full text-left px-2 py-1 text-xs text-default hover:bg-hover rounded-sm"
          >Install from folder…</button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onFromFile() }}
            className="block w-full text-left px-2 py-1 text-xs text-default hover:bg-hover rounded-sm"
          >Install from .canvext…</button>
        </div>
      )}
    </div>
  )
}
