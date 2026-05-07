type ViewMode = 'edit' | 'preview'

interface Props {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
}

export function EditorViewModeToggle({ mode, onChange }: Props) {
  const handleClick = (next: ViewMode) => {
    if (next === mode) return
    onChange(next)
  }
  const cls = (id: ViewMode) =>
    `px-3 text-xs border-r border-default ${
      mode === id
        ? 'bg-app text-default'
        : 'text-muted hover:bg-hover'
    }`
  return (
    <div className="shrink-0 flex items-stretch border-l border-default">
      <button
        type="button"
        aria-pressed={mode === 'edit'}
        onClick={() => handleClick('edit')}
        className={cls('edit')}
      >
        Edit
      </button>
      <button
        type="button"
        data-testid="preview-toggle"
        aria-pressed={mode === 'preview'}
        onClick={() => handleClick('preview')}
        className={cls('preview')}
      >
        Preview
      </button>
    </div>
  )
}
