import { useState } from 'react'

interface Props {
  /** Chip label, e.g. "tool_call · edit_file". */
  name: string
  /** Pre-formatted body string (JSON, raw text, etc.). */
  body: string
  /** Show "err" badge after the size. */
  error?: boolean
  /** Show "denied" badge instead of "err". Takes precedence over error. */
  denied?: boolean
  /** Start in expanded state. Default: collapsed. */
  defaultOpen?: boolean
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export function CollapsibleBlob({ name, body, error, denied, defaultOpen }: Props) {
  const [open, setOpen] = useState(!!defaultOpen)
  const size = formatSize(new Blob([body]).size)

  return (
    <div className="my-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-[11px] text-muted hover:text-default px-2 py-0.5 rounded-sm border border-default w-full text-left"
      >
        <span className="font-mono">{open ? '▾' : '▸'}</span>
        <span className="truncate">{name}</span>
        <span className="text-subtle">·</span>
        <span className="text-subtle">{size}</span>
        {denied ? (
          <span className="ml-1 px-1 rounded-sm bg-amber-700/40 text-amber-200">denied</span>
        ) : error ? (
          <span className="ml-1 px-1 rounded-sm bg-red-800/40 text-red-200">err</span>
        ) : null}
      </button>
      {open && (
        <pre
          data-testid="collapsible-body"
          className="mt-1 ml-4 px-2 py-1 text-[11px] whitespace-pre-wrap wrap-break-word border-l border-default text-default"
        >
          {body}
        </pre>
      )}
    </div>
  )
}
