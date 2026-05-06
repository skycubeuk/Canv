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
    `px-3 text-xs border-r border-stone-200 dark:border-neutral-800 ${
      mode === id
        ? 'bg-white dark:bg-neutral-950 text-stone-900 dark:text-neutral-100'
        : 'text-stone-600 dark:text-neutral-400 hover:bg-stone-200/60 dark:hover:bg-neutral-800/60'
    }`
  return (
    <div className="shrink-0 flex items-stretch border-l border-stone-200 dark:border-neutral-800">
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
