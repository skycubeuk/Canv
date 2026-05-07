import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { OutlineNode } from '../../../lib/outline'

interface OutlinePanelProps {
  nodes: OutlineNode[]
  resetKey: string | null
  onJump: (line: number) => void
  collapsed: boolean
  onToggleSectionCollapsed: () => void
}

export function OutlinePanel(props: OutlinePanelProps) {
  const { nodes, resetKey, onJump, collapsed, onToggleSectionCollapsed } = props
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
  const [prevResetKey, setPrevResetKey] = useState<string | null>(resetKey)
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey)
    setCollapsedIds(new Set())
  }

  const toggleNode = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="h-full flex flex-col bg-stone-100 dark:bg-neutral-900">
      <button
        type="button"
        onClick={onToggleSectionCollapsed}
        className="shrink-0 flex items-center gap-1 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-stone-600 dark:text-neutral-400 hover:bg-stone-200/60 dark:hover:bg-neutral-800/60 border-b border-stone-200 dark:border-neutral-800"
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronRight aria-hidden className="w-3 h-3" />
        ) : (
          <ChevronDown aria-hidden className="w-3 h-3" />
        )}
        <span>Outline</span>
      </button>
      {!collapsed && (
        <div
          role="tree"
          aria-label="Document outline"
          className="flex-1 min-h-0 overflow-y-auto py-1"
        >
          {nodes.map((n) => (
            <OutlineNodeRow
              key={n.id}
              node={n}
              collapsedIds={collapsedIds}
              onToggle={toggleNode}
              onJump={onJump}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface RowProps {
  node: OutlineNode
  collapsedIds: Set<string>
  onToggle: (id: string) => void
  onJump: (line: number) => void
}

function OutlineNodeRow({ node, collapsedIds, onToggle, onJump }: RowProps) {
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsedIds.has(node.id)
  const indent = (node.level - 1) * 12

  return (
    <div role="treeitem" aria-level={node.level} aria-expanded={hasChildren ? !isCollapsed : undefined}>
      <div
        className="flex items-center text-xs hover:bg-stone-200/60 dark:hover:bg-neutral-800/60"
        style={{ paddingLeft: indent + 4 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-label={`Toggle ${node.text}`}
            className="shrink-0 p-0.5 text-stone-500 dark:text-neutral-500"
          >
            {isCollapsed ? (
              <ChevronRight aria-hidden className="w-3 h-3" />
            ) : (
              <ChevronDown aria-hidden className="w-3 h-3" />
            )}
          </button>
        ) : (
          <span aria-hidden className="w-4 h-4 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onJump(node.line)}
          title={node.text}
          className="flex-1 min-w-0 text-left px-1 py-0.5 truncate text-stone-800 dark:text-neutral-200"
        >
          {node.text}
        </button>
      </div>
      {hasChildren && !isCollapsed && (
        <div>
          {node.children.map((c) => (
            <OutlineNodeRow
              key={c.id}
              node={c}
              collapsedIds={collapsedIds}
              onToggle={onToggle}
              onJump={onJump}
            />
          ))}
        </div>
      )}
    </div>
  )
}
