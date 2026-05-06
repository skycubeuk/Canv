import { useState } from 'react'

export interface ChatToolChipProps {
  name: string
  inputPath?: string
  status: 'running' | 'success' | 'error'
  summary?: string
  result?: string
}

const VERBS: Record<string, string> = {
  list_dir: 'Listing',
  read_file: 'Reading',
  search_workspace: 'Searching',
}

const ICONS: Record<string, string> = {
  Reading: '📖',
  Listing: '📁',
  Searching: '🔎',
}

export function ChatToolChip({ name, inputPath, status, summary, result }: ChatToolChipProps) {
  const [open, setOpen] = useState(status === 'error')
  const verb = VERBS[name] ?? name
  const icon = ICONS[verb] ?? '⚙️'
  const headline = status === 'running'
    ? `${verb} ${inputPath ?? ''}…`.trim()
    : summary
      ? `${icon} ${inputPath ?? name} · ${summary}`
      : `${icon} ${inputPath ?? name}`
  const tone = status === 'error'
    ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-700/60 dark:bg-red-950/40 dark:text-red-200'
    : 'border-stone-200 bg-stone-50 text-stone-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300'
  return (
    <div data-testid="chip-root" className={`my-1 inline-block max-w-full rounded-md border px-2 py-1 text-xs ${tone}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 font-mono text-left"
      >
        {status === 'running' && <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-current" />}
        <span>{headline}</span>
      </button>
      {open && (result ?? '').length > 0 && (
        <pre data-testid="chip-result-body" className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-white/40 p-2 text-[11px] dark:bg-black/30">
          {result}
        </pre>
      )}
    </div>
  )
}
