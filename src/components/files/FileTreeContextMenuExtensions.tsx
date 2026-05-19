import type { MenuRecord, FileHandlerRecord } from '../../types/extension-contributions'

function extOf(p: string): string {
  const i = p.lastIndexOf('.')
  return i >= 0 ? p.slice(i).toLowerCase() : ''
}

function matchesWhen(clause: string | undefined, target: { relPath: string; isDir: boolean }): boolean {
  if (!clause) return true
  if (clause === 'isDir') return target.isDir
  if (clause === 'isFile') return !target.isDir
  if (clause.startsWith('fileExt:')) {
    const want = clause.slice('fileExt:'.length).toLowerCase()
    return !target.isDir && extOf(target.relPath) === want
  }
  return false
}

interface Props {
  target: { relPath: string; isDir: boolean }
  menus: MenuRecord[]
  handlers: FileHandlerRecord[]
  onCommand: (commandId: string, args: unknown[]) => void
  onOpenWith: (extensionId: string | null) => void
}

export function FileTreeContextMenuExtensions({ target, menus, handlers, onCommand, onOpenWith }: Props) {
  const items = menus.filter((m) => m.menu === 'fileTree.context' && matchesWhen(m.when, target))
  const matchingHandlers = !target.isDir
    ? handlers.filter((h) => h.extensions.includes(extOf(target.relPath)))
    : []

  if (items.length === 0 && matchingHandlers.length === 0) return null

  return (
    <>
      <div className="my-1 border-t border-default" />
      {matchingHandlers.length > 0 && (
        <div className="px-3 py-1 text-[10.5px] uppercase tracking-wider text-subtle">Open with</div>
      )}
      {matchingHandlers.map((h) => (
        <button
          key={h.extensionId}
          type="button"
          onClick={() => onOpenWith(h.extensionId)}
          className="block w-full text-left px-3 py-1.5 hover:bg-hover"
        >{h.extensionId}</button>
      ))}
      {matchingHandlers.length > 0 && (
        <button
          type="button"
          onClick={() => onOpenWith(null)}
          className="block w-full text-left px-3 py-1.5 hover:bg-hover"
        >Text editor</button>
      )}
      {items.length > 0 && matchingHandlers.length > 0 && (
        <div className="my-1 border-t border-default" />
      )}
      {items.map((m, i) => (
        <button
          key={`${m.extensionId}-${m.command}-${i}`}
          type="button"
          onClick={() => onCommand(m.command, [target.relPath])}
          className="block w-full text-left px-3 py-1.5 hover:bg-hover"
        >{m.title ?? m.command}</button>
      ))}
    </>
  )
}
