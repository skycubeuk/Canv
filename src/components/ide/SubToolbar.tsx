import { ChevronRight } from 'lucide-react'

type ViewMode = 'edit' | 'preview'

interface Props {
  workspaceName: string | null
  relPath: string | null
  onClickFolder: (folderRel: string) => void
  viewMode: ViewMode | null
  onChangeViewMode: (mode: ViewMode) => void
  showViewToggle: boolean
}

function basename(p: string): string {
  const i = p.lastIndexOf('/')
  return i >= 0 ? p.slice(i + 1) : p
}

interface Segment { label: string; folderRel: string | null }

function buildSegments(workspaceName: string | null, relPath: string | null): Segment[] {
  const segs: Segment[] = []
  if (workspaceName) segs.push({ label: basename(workspaceName) || workspaceName, folderRel: null })
  if (!relPath) return segs
  const parts = relPath.split('/').filter(Boolean)
  let acc = ''
  parts.forEach((p, i) => {
    acc = acc ? `${acc}/${p}` : p
    const isLast = i === parts.length - 1
    segs.push({ label: p, folderRel: isLast ? null : acc })
  })
  return segs
}

export function SubToolbar(props: Props) {
  const { workspaceName, relPath, onClickFolder, viewMode, onChangeViewMode, showViewToggle } = props
  const segments = buildSegments(workspaceName, relPath)

  return (
    <div className="shrink-0 h-8 flex items-center px-4 gap-3 border-b border-default text-[11.5px]">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 min-w-0 text-subtle whitespace-nowrap">
        {segments.map((s, i) => {
          const isLast = i === segments.length - 1
          const isClickable = s.folderRel != null
          return (
            <span key={`${s.label}-${i}`} className="flex items-center gap-1.5">
              {isClickable ? (
                <button
                  type="button"
                  onClick={() => onClickFolder(s.folderRel!)}
                  className="hover:text-default truncate"
                >
                  {s.label}
                </button>
              ) : (
                <span className={isLast ? 'text-default truncate' : 'truncate'}>{s.label}</span>
              )}
              {!isLast && <ChevronRight aria-hidden className="w-2.5 h-2.5 shrink-0" />}
            </span>
          )
        })}
      </nav>

      <div className="flex-1" />

      {showViewToggle && viewMode != null && (
        <div className="inline-flex p-0.5 bg-elev border border-default rounded-md">
          {(['edit', 'preview'] as const).map((m) => {
            const selected = m === viewMode
            return (
              <button
                key={m}
                type="button"
                aria-pressed={selected}
                onClick={() => onChangeViewMode(m)}
                className={`px-2.5 py-0.5 text-[11.5px] rounded font-medium ${
                  selected ? 'bg-app text-default shadow-sm' : 'text-muted hover:text-default'
                }`}
              >
                {m === 'edit' ? 'Edit' : 'Preview'}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
