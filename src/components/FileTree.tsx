import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown, ChevronRight, Folder, FileText,
  FilePlus, FolderPlus, FolderOpen, Pin,
} from 'lucide-react'
import type { DirEntry, DirFile, DirNode } from '../lib/fs'
import { useDialogs } from '../lib/dialogs'

interface Props {
  root: string | null
  tree: DirNode | null
  truncated: boolean
  openRels: Set<string>
  activeRel: string | null
  pinnedRels: Set<string>
  onOpen: (rel: string) => void
  onPin: (rel: string) => void
  onUnpin: (rel: string) => void
  onCreateFile: (parentRel: string) => void
  onCreateFolder: (parentRel: string) => void
  onRename: (rel: string, newName: string) => void
  onDelete: (rel: string) => void
  onChangeWorkspace: () => void
  revealRel?: string | null
}

interface MenuState {
  x: number
  y: number
  target: DirEntry
}

function basename(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i >= 0 ? rel.slice(i + 1) : rel
}

function dirname(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i >= 0 ? rel.slice(0, i) : ''
}

export function FileTree(props: Props) {
  const {
    root, tree, truncated, openRels, activeRel, pinnedRels,
    onOpen, onPin, onUnpin,
    onCreateFile, onCreateFolder, onRename, onDelete, onChangeWorkspace,
    revealRel,
  } = props

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [renaming, setRenaming] = useState<{ rel: string; value: string } | null>(null)

  // Transient UI state (expanded folders, open menu, in-progress rename) is
  // reset on workspace switch by remounting via key={root} in FilesTab.

  // When the breadcrumb (or any future caller) asks to reveal a folder,
  // expand the tree so every ancestor + the folder itself is open.
  useEffect(() => {
    if (!revealRel) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- functional updater; expands ancestors in response to external prop, no cascade risk
    setExpanded((prev) => {
      const next = new Set(prev)
      const parts = revealRel.split('/')
      let acc = ''
      for (const seg of parts) {
        acc = acc ? `${acc}/${seg}` : seg
        next.add(acc)
      }
      return next
    })
  }, [revealRel])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menu])

  const totalNodes = useMemo(() => (tree ? countNodes(tree) : 0), [tree])

  if (!root) {
    return (
      <aside className="h-full flex flex-col items-center justify-center text-center px-4 text-sm text-stone-500 dark:text-neutral-400 bg-stone-100 dark:bg-neutral-900 border-r border-stone-200 dark:border-neutral-800">
        <p className="mb-3">No workspace open.</p>
        <button type="button" className="btn-primary" onClick={onChangeWorkspace}>
          Choose folder
        </button>
      </aside>
    )
  }

  if (!tree) {
    return (
      <aside className="h-full p-4 text-sm text-stone-500 dark:text-neutral-400 bg-stone-100 dark:bg-neutral-900 border-r border-stone-200 dark:border-neutral-800">
        Loading…
      </aside>
    )
  }

  const toggle = (rel: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(rel)) next.delete(rel)
      else next.add(rel)
      return next
    })
  }

  const beginRename = (rel: string) => {
    setMenu(null)
    setRenaming({ rel, value: basename(rel) })
  }

  const commitRename = () => {
    if (!renaming) return
    const name = renaming.value.trim()
    if (!name || name === basename(renaming.rel) || /[\\/]/.test(name)) {
      setRenaming(null)
      return
    }
    const parent = dirname(renaming.rel)
    const newRel = parent ? `${parent}/${name}` : name
    onRename(renaming.rel, newRel)
    setRenaming(null)
  }

  const handleContextMenu = (e: React.MouseEvent, target: DirEntry) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, target })
  }

  const renderEntry = (entry: DirEntry, depth: number): React.ReactNode => {
    const indent = depth * 12 + 8
    if (entry.kind === 'dir') {
      const isOpen = expanded.has(entry.relPath)
      return (
        <div key={entry.relPath || '__root__'}>
          <div
            className="flex items-center gap-1 px-1 py-0.5 text-sm cursor-pointer rounded hover:bg-stone-200/70 dark:hover:bg-neutral-800/70 text-stone-700 dark:text-neutral-300"
            style={{ paddingLeft: indent }}
            onClick={() => toggle(entry.relPath)}
            onContextMenu={(e) => handleContextMenu(e, entry)}
          >
            {isOpen
              ? <ChevronDown aria-hidden className="w-3 h-3 text-stone-500" />
              : <ChevronRight aria-hidden className="w-3 h-3 text-stone-500" />}
            <Folder aria-hidden className="w-4 h-4" />
            <span className="truncate flex-1">{entry.name || basename(root)}</span>
          </div>
          {isOpen && entry.children.map((c) => renderEntry(c, depth + 1))}
        </div>
      )
    }
    return renderFile(entry, indent)
  }

  const renderFile = (file: DirFile, indent: number) => {
    const active = file.relPath === activeRel
    const open = openRels.has(file.relPath)
    const isPinned = pinnedRels.has(file.relPath)
    const isRenaming = renaming?.rel === file.relPath
    return (
      <div
        key={file.relPath}
        className={`group flex items-center gap-1 pr-1 py-0.5 text-sm cursor-pointer rounded ${
          active
            ? 'bg-stone-200 dark:bg-neutral-800 text-stone-900 dark:text-neutral-100 border-l-2 border-stone-700 dark:border-neutral-300'
            : open
              ? 'bg-stone-100 dark:bg-neutral-800/50 text-stone-700 dark:text-neutral-200 hover:bg-stone-200/80 dark:hover:bg-neutral-800/80'
              : 'text-stone-600 dark:text-neutral-400 hover:bg-stone-200/60 dark:hover:bg-neutral-800/60'
        }`}
        style={{ paddingLeft: indent + (active ? 0 : 2) }}
        onClick={() => !isRenaming && onOpen(file.relPath)}
        onDoubleClick={() => !isRenaming && onOpen(file.relPath)}
        onContextMenu={(e) => handleContextMenu(e, file)}
      >
        <span aria-hidden className="w-3 text-xs" />
        <FileText aria-hidden className={`w-4 h-4 ${file.binary ? 'opacity-40' : ''}`} />
        {isRenaming ? (
          <input
            autoFocus
            value={renaming!.value}
            onChange={(e) => setRenaming({ rel: file.relPath, value: e.target.value })}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              else if (e.key === 'Escape') setRenaming(null)
            }}
            className="input flex-1 py-0.5 text-sm"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={`truncate flex-1 ${file.binary ? 'opacity-40' : ''}`}>{file.name}</span>
        )}
        {!isRenaming && isPinned && (
          <span
            className="ml-auto inline-flex items-center gap-0.5 px-1 text-xs text-amber-600 dark:text-amber-400 select-none"
            title="Pinned — right-click to unpin"
            aria-label={`${file.name} pinned to context`}
          >
            <Pin aria-hidden className="w-3 h-3" />
          </span>
        )}
      </div>
    )
  }

  return (
    <aside className="h-full flex flex-col bg-stone-100 dark:bg-neutral-900 border-r border-stone-200 dark:border-neutral-800 overflow-hidden">
      <div className="shrink-0 px-3 py-2 flex items-center gap-2 border-b border-stone-200 dark:border-neutral-800">
        <span className="text-xs uppercase tracking-wide opacity-60 truncate flex-1" title={root}>
          {basename(root) || root}
        </span>
        <button type="button" aria-label="New file in root" title="New file" className="btn-icon" onClick={() => onCreateFile('')}>
          <FilePlus aria-hidden className="w-4 h-4" />
        </button>
        <button type="button" aria-label="New folder in root" title="New folder" className="btn-icon" onClick={() => onCreateFolder('')}>
          <FolderPlus aria-hidden className="w-4 h-4" />
        </button>
        <button type="button" aria-label="Change workspace folder" title="Change workspace" className="btn-icon" onClick={onChangeWorkspace}>
          <FolderOpen aria-hidden className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {tree.children.length === 0 ? (
          <div className="px-4 py-3 text-xs text-stone-500 dark:text-neutral-400">
            Empty folder. Use the New file button above to create your first file.
          </div>
        ) : (
          tree.children.map((c) => renderEntry(c, 0))
        )}
        {truncated && (
          <div className="px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Folder truncated — too many files to display.
          </div>
        )}
        {totalNodes > 1000 && (
          <div className="px-3 py-2 text-xs text-stone-500 dark:text-neutral-400">
            {totalNodes} entries — large workspaces may feel sluggish.
          </div>
        )}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          target={menu.target}
          isPinned={menu.target.kind === 'file' ? pinnedRels.has(menu.target.relPath) : false}
          onClose={() => setMenu(null)}
          onPin={onPin}
          onUnpin={onUnpin}
          onRename={beginRename}
          onDelete={onDelete}
          onCreateFile={onCreateFile}
          onCreateFolder={onCreateFolder}
        />
      )}
    </aside>
  )
}

function ContextMenu(props: {
  x: number; y: number; target: DirEntry
  isPinned: boolean
  onClose: () => void
  onPin: (rel: string) => void
  onUnpin: (rel: string) => void
  onRename: (rel: string) => void
  onDelete: (rel: string) => void
  onCreateFile: (parentRel: string) => void
  onCreateFolder: (parentRel: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const dialogs = useDialogs()
  const isDir = props.target.kind === 'dir'
  const parentRel = isDir ? props.target.relPath : dirname(props.target.relPath)
  const isMd = !isDir && /\.(md|markdown)$/i.test(props.target.relPath)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
  }, [])

  return (
    <div
      ref={ref}
      tabIndex={-1}
      style={{ left: props.x, top: props.y }}
      className="fixed z-40 min-w-[180px] bg-white dark:bg-neutral-900 border border-stone-200 dark:border-neutral-800 rounded-md shadow-lg py-1 text-sm"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuItem onClick={() => { props.onCreateFile(parentRel); props.onClose() }}>
        New file…
      </MenuItem>
      <MenuItem onClick={() => { props.onCreateFolder(parentRel); props.onClose() }}>
        New folder…
      </MenuItem>
      {isMd && <div className="my-1 border-t border-stone-200 dark:border-neutral-800" />}
      {isMd && !props.isPinned && (
        <MenuItem onClick={() => { props.onPin(props.target.relPath); props.onClose() }}>
          Pin to context
        </MenuItem>
      )}
      {isMd && props.isPinned && (
        <MenuItem onClick={() => { props.onUnpin(props.target.relPath); props.onClose() }}>
          Unpin from context
        </MenuItem>
      )}
      {props.target.relPath && <div className="my-1 border-t border-stone-200 dark:border-neutral-800" />}
      {props.target.relPath && (
        <MenuItem onClick={() => { props.onRename(props.target.relPath); props.onClose() }}>
          Rename
        </MenuItem>
      )}
      {props.target.relPath && (
        <MenuItem
          onClick={() => {
            const rel = props.target.relPath
            const onClose = props.onClose
            const onDelete = props.onDelete
            void (async () => {
              const ok = await dialogs.confirm({
                title: 'Delete?',
                message: `Move "${rel}" to trash?`,
                confirmLabel: 'Delete',
                danger: true,
              })
              if (ok) onDelete(rel)
              onClose()
            })()
          }}
        >
          <span className="text-red-600 dark:text-red-400">Delete</span>
        </MenuItem>
      )}
      {props.target.relPath && (
        <MenuItem
          onClick={() => {
            navigator.clipboard?.writeText(props.target.relPath).catch(() => { /* ignore */ })
            props.onClose()
          }}
        >
          Copy path
        </MenuItem>
      )}
    </div>
  )
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full text-left px-3 py-1.5 hover:bg-stone-100 dark:hover:bg-neutral-800"
    >
      {children}
    </button>
  )
}

function countNodes(node: DirNode): number {
  let n = 0
  for (const c of node.children) {
    n += 1
    if (c.kind === 'dir') n += countNodes(c)
  }
  return n
}
