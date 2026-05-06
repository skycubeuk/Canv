import { useMemo } from 'react'
import { AlertTriangle, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { LintIssue, LintRuleId } from '../../../lib/lintTypes'

interface Props {
  issues: LintIssue[]
  scanState: 'idle' | 'scanning' | 'done' | 'error'
  scanError: string | null
  onScan: () => void
  onClear: () => void
  /** Click handler — opens the file in the active editor group and selects the offending range. */
  onJump: (issue: LintIssue) => void
}

const SEVERITY_BADGE: Record<'warn' | 'error', { Icon: LucideIcon; className: string }> = {
  warn:  { Icon: AlertTriangle, className: 'text-amber-600 dark:text-amber-400' },
  error: { Icon: XCircle,       className: 'text-red-600 dark:text-red-400' },
}

const RULE_LABEL: Record<LintRuleId, string> = {
  'broken-link':   'Broken link',
  'front-matter':  'Front-matter',
  'heading-skip':  'Heading skip',
  'dead-image':    'Dead image',
}

export function ProblemsTab({ issues, scanState, scanError, onScan, onClear, onJump }: Props) {
  const grouped = useMemo(() => groupByRel(issues), [issues])

  return (
    <div className="h-full flex flex-col bg-stone-100 dark:bg-neutral-900 text-xs overflow-hidden">
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-stone-200 dark:border-neutral-800">
        <span className="font-medium text-stone-700 dark:text-neutral-300 flex-1">
          {issues.length === 0 ? 'No problems detected.' : `${issues.length} problem${issues.length === 1 ? '' : 's'}`}
        </span>
        <button
          type="button"
          onClick={onScan}
          disabled={scanState === 'scanning'}
          className="px-2 py-0.5 rounded border border-stone-300 dark:border-neutral-700 text-stone-600 dark:text-neutral-400 hover:bg-stone-200 dark:hover:bg-neutral-800 disabled:opacity-50"
          title="Lint every markdown file in the workspace"
        >
          {scanState === 'scanning' ? 'Scanning…' : 'Scan workspace'}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="px-2 py-0.5 rounded text-stone-500 dark:text-neutral-400 hover:bg-stone-200 dark:hover:bg-neutral-800"
          title="Clear workspace-scan results (open-tab issues stay)"
        >
          Clear
        </button>
      </div>

      {scanError && (
        <p className="px-3 py-2 text-red-600 dark:text-red-400">Scan error: {scanError}</p>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        {grouped.map(([rel, rows]) => (
          <div key={rel} className="mb-1">
            <div className="px-3 py-1 text-[11px] font-semibold text-stone-500 dark:text-neutral-500 uppercase tracking-wide truncate">
              {rel} <span className="text-stone-400">({rows.length})</span>
            </div>
            {rows.map((issue, i) => {
              const badge = SEVERITY_BADGE[issue.severity]
              return (
                <button
                  key={`${rel}:${issue.line}:${i}`}
                  type="button"
                  onClick={() => onJump(issue)}
                  className="w-full text-left flex items-start gap-2 px-3 py-1 hover:bg-stone-200/60 dark:hover:bg-neutral-800/60"
                  title={issue.match}
                >
                  <span className={`shrink-0 w-4 flex items-center justify-center ${badge.className}`} aria-label={issue.severity}>
                    <badge.Icon aria-hidden className="w-3 h-3" />
                  </span>
                  <span className="text-stone-400 mr-1 shrink-0">L{issue.line}</span>
                  <span className="text-stone-700 dark:text-neutral-300 flex-1 truncate">
                    {issue.message}
                  </span>
                  <span className="text-stone-400 dark:text-neutral-600 text-[10px] shrink-0 ml-2">
                    {RULE_LABEL[issue.rule]}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function groupByRel(issues: LintIssue[]): [string, LintIssue[]][] {
  const map = new Map<string, LintIssue[]>()
  for (const i of issues) {
    const list = map.get(i.rel)
    if (list) list.push(i)
    else map.set(i.rel, [i])
  }
  return Array.from(map.entries())
}
