import { GitBranch } from 'lucide-react'

interface Props {
  workspaceName: string | null
  relPath: string | null
  /** When set, renders the diff breadcrumb instead of the file breadcrumb. */
  diffEntry?: { relPath: string; baseRef: string } | null
  onClickFolder?: (folderRel: string) => void
}

function basename(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i >= 0 ? rel.slice(i + 1) : rel
}

export function Breadcrumbs({ workspaceName, relPath, diffEntry, onClickFolder }: Props) {
  // Diff breadcrumb takes priority when provided.
  if (diffEntry) {
    return (
      <nav
        aria-label="Breadcrumbs"
        className="shrink-0 px-3 py-1 text-[11px] text-muted border-b border-default flex items-center gap-1 truncate"
      >
        <GitBranch aria-hidden className="w-3 h-3" />
        <span className="text-default">
          Diff: {diffEntry.relPath} ({diffEntry.baseRef})
        </span>
      </nav>
    )
  }

  if (!relPath) return null

  const parts = relPath.split('/')
  const file = parts.pop() ?? relPath
  const folders: { name: string; rel: string }[] = []
  let acc = ''
  for (const seg of parts) {
    acc = acc ? `${acc}/${seg}` : seg
    folders.push({ name: seg, rel: acc })
  }

  const wsLabel = workspaceName ? basename(workspaceName) : 'workspace'

  return (
    <nav
      aria-label="Breadcrumbs"
      className="shrink-0 px-3 py-1 text-[11px] text-muted border-b border-default flex items-center gap-1 truncate"
    >
      <span className="opacity-70">{wsLabel}</span>
      {folders.map((f) => (
        <span key={f.rel} className="flex items-center gap-1">
          <span aria-hidden>›</span>
          <button
            type="button"
            className="hover:text-default"
            onClick={() => onClickFolder?.(f.rel)}
          >
            {f.name}
          </button>
        </span>
      ))}
      <span aria-hidden>›</span>
      <span className="text-default truncate">{file}</span>
    </nav>
  )
}
