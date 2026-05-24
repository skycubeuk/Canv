interface Props {
  count: number
  onAcceptAll: () => void
  onRejectAll: () => void
}

/** Floating bar shown over the editor while a rewrite has pending hunks. */
export function SuggestionBar({ count, onAcceptAll, onRejectAll }: Props) {
  if (count <= 0) return null
  const noun = count === 1 ? 'change' : 'changes'
  return (
    <div className="absolute top-2 right-3 z-10 flex items-center gap-2 rounded-md border border-default bg-panel px-2.5 py-1 text-xs shadow-md">
      <span className="font-medium text-amber-400">{count} {noun}</span>
      <span className="text-subtle">|</span>
      <button type="button" className="text-green-400 hover:underline" onClick={onAcceptAll}>
        Accept all
      </button>
      <button type="button" className="text-red-400 hover:underline" onClick={onRejectAll}>
        Reject all
      </button>
    </div>
  )
}
