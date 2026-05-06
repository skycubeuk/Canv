import type { Mode } from '../../config/types'
import type { WorkspaceKind } from '../../lib/fs'

interface Props {
  saveState: 'saved' | 'saving' | 'conflict'
  profile: Mode
  workspaceName: string | null
  kind: WorkspaceKind | null
  wordCount: number
  selectionWordCount: number | null
  onClickProfile: () => void
  apiKeyMissing: boolean
  onClickApiKeyWarning: () => void
}

function basenameOrNull(p: string | null): string {
  if (!p) return ''
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i >= 0 ? p.slice(i + 1) : p
}

export function StatusBar(props: Props) {
  const { saveState, profile, workspaceName, kind, wordCount, selectionWordCount, onClickProfile, apiKeyMissing, onClickApiKeyWarning } = props

  const saveContent: string = saveState === 'saved'
    ? '● Saved'
    : saveState === 'saving'
      ? '● Saving…'
      : '⚠ Conflict'
  const saveColor =
    saveState === 'saved'
      ? 'text-stone-300'
      : saveState === 'saving'
      ? 'text-amber-300'
      : 'text-red-300'

  const wordsLabel = selectionWordCount != null
    ? `selection: ${selectionWordCount.toLocaleString()} words`
    : `${wordCount.toLocaleString()} words`

  return (
    <div
      role="status"
      aria-label="Status bar"
      className="shrink-0 h-6 flex items-center gap-3 px-3 text-[11px] bg-stone-800 text-stone-200 dark:bg-neutral-950 dark:text-neutral-400 border-t border-stone-900 dark:border-neutral-800"
    >
      {apiKeyMissing && (
        <button
          type="button"
          onClick={onClickApiKeyWarning}
          className="text-amber-300 hover:text-amber-200 transition-colors"
          title="No API key — click to open Settings"
        >
          ⚠ No API key
        </button>
      )}

      <span className={saveColor}>{saveContent}</span>

      <button
        type="button"
        data-testid="profile-switcher"
        onClick={onClickProfile}
        className="hover:text-white transition-colors"
        title="Click to change profile"
      >
        {profile.label}
      </button>

      {workspaceName && (
        kind?.kind === 'remote' ? (
          <span className="flex items-center gap-1 truncate max-w-[260px]" title={kind.display}>
            <span className="px-1.5 py-px text-[9px] uppercase tracking-wider rounded bg-amber-200 text-amber-900 dark:bg-amber-700 dark:text-amber-100">remote</span>
            <span className="truncate">{kind.display}</span>
          </span>
        ) : (
          <span className="truncate max-w-[260px]" title={workspaceName}>
            {basenameOrNull(workspaceName)}
          </span>
        )
      )}

      <span className="ml-auto">{wordsLabel}</span>
    </div>
  )
}
