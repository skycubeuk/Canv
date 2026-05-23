interface Props {
  suggestions: string[]
  highlight: number
  onPick: (index: number) => void
  onHover: (index: number) => void
}

export function AtMentionPopover({ suggestions, highlight, onPick, onHover }: Props) {
  if (suggestions.length === 0) return null
  return (
    <div
      role="listbox"
      aria-label="File suggestions"
      data-testid="at-mention-popover"
      className="absolute left-2 right-2 bottom-full mb-1 bg-elev border border-default rounded-md shadow-lg z-20 max-h-56 overflow-auto py-1 text-[0.85em]"
    >
      {suggestions.map((rel, i) => {
        const slash = rel.lastIndexOf('/')
        const dir = slash >= 0 ? rel.slice(0, slash + 1) : ''
        const base = slash >= 0 ? rel.slice(slash + 1) : rel
        const selected = i === highlight
        return (
          <button
            key={rel}
            type="button"
            role="option"
            aria-selected={selected}
            onMouseDown={(e) => {
              e.preventDefault()
              onPick(i)
            }}
            onMouseEnter={() => onHover(i)}
            className={`block w-full text-left px-2 py-1 truncate ${
              selected ? 'bg-active text-default' : 'text-muted hover:bg-hover'
            }`}
          >
            <span className="font-medium text-default">{base}</span>
            {dir && <span className="ml-2 text-subtle">{dir.replace(/\/$/, '')}</span>}
          </button>
        )
      })}
    </div>
  )
}
