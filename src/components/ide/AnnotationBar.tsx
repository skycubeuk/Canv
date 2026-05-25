interface Props {
  count: number
  allCollapsed: boolean
  onToggleCollapseAll: (collapsed: boolean) => void
}

/** Floating bar shown over the editor while open annotations exist. Mirrors
 *  SuggestionBar; offset below it so the two don't overlap when both show. */
export function AnnotationBar({ count, allCollapsed, onToggleCollapseAll }: Props) {
  if (count <= 0) return null
  const noun = count === 1 ? 'note' : 'notes'
  return (
    <div className="absolute top-11 right-3 z-10 flex items-center gap-2 rounded-md border border-default bg-panel px-2.5 py-1 text-xs shadow-md">
      <span className="font-medium text-accent">{count} {noun}</span>
      <span className="text-subtle">|</span>
      <button
        type="button"
        className="text-default hover:underline"
        onClick={() => onToggleCollapseAll(!allCollapsed)}
      >
        {allCollapsed ? 'Expand all' : 'Collapse all'}
      </button>
    </div>
  )
}
