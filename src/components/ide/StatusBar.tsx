import { MessageSquare, Settings } from 'lucide-react'
import type { Mode } from '../../config/types'
import type { WorkspaceKind } from '../../lib/fs'
import { useContributions } from '../../hooks/useContributions'
import { StatusBarItem } from './StatusBarItem'

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
  cursorLine: number | null
  cursorCol: number | null
  branch: string | null
  diffStats: { added: number; removed: number } | null
  chatVisible: boolean
  onToggleChat: () => void
  onOpenSettings: () => void
  meterTokens: number | null
  meterCostUsd: number | null
}

function basenameOrNull(p: string | null): string {
  if (!p) return ''
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i >= 0 ? p.slice(i + 1) : p
}

export function StatusBar(props: Props) {
  const {
    saveState, profile, workspaceName, kind, wordCount, selectionWordCount,
    onClickProfile, apiKeyMissing, onClickApiKeyWarning,
    cursorLine, cursorCol, branch, diffStats,
    chatVisible, onToggleChat, onOpenSettings, meterTokens, meterCostUsd,
  } = props

  const contributions = useContributions()

  const onCommandInvoke = (commandId: string) => { void window.canvExtensions?.invokeCommand?.(commandId) }

  const leftItems = contributions.statusBarItems.filter((s) => s.alignment === 'left').sort((a, b) => b.priority - a.priority)
  const rightItems = contributions.statusBarItems.filter((s) => s.alignment === 'right').sort((a, b) => b.priority - a.priority)

  const wordsLabel = selectionWordCount != null
    ? `selection: ${selectionWordCount.toLocaleString()} words`
    : `${wordCount.toLocaleString()} words`

  return (
    <div
      role="status"
      aria-label="Status bar"
      className="shrink-0 h-[26px] flex items-center gap-3 px-3 text-[11px] bg-panel text-muted border-t border-default"
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

      {saveState === 'saved' ? (
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" aria-hidden />
          <span>Saved</span>
        </span>
      ) : saveState === 'saving' ? (
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-hidden />
          <span>Saving…</span>
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-red-300">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400" aria-hidden />
          <span>Conflict</span>
        </span>
      )}

      <span aria-hidden className="w-px h-3 bg-[rgb(var(--border-default))]" />

      <button
        type="button"
        data-testid="profile-switcher"
        onClick={onClickProfile}
        className="text-muted hover:text-default transition-colors"
        title="Click to change profile"
      >
        {profile.label}
      </button>

      {workspaceName && (
        kind?.kind === 'remote' ? (
          <span className="flex items-center gap-1 truncate max-w-[260px]" title={kind.display}>
            <span className="px-1.5 py-px text-[9px] uppercase tracking-wider rounded-sm bg-amber-700 text-amber-100">remote</span>
            <span className="truncate">{kind.display}</span>
          </span>
        ) : (
          <span className="truncate max-w-[260px]" title={workspaceName}>
            {basenameOrNull(workspaceName)}
          </span>
        )
      )}

      {branch && (
        <>
          <span aria-hidden className="w-px h-3 bg-[rgb(var(--border-default))]" />
          <span className="text-muted">{branch}</span>
          {diffStats && (
            <span className="text-subtle">+{diffStats.added} −{diffStats.removed}</span>
          )}
        </>
      )}

      {leftItems.map((item) => (
        <StatusBarItem
          key={`${item.extensionId}-${item.id}`}
          text={item.text} icon={item.icon} tooltip={item.tooltip}
          command={item.command} onCommandInvoke={onCommandInvoke}
        />
      ))}

      <div className="ml-auto flex items-center gap-3">
        {rightItems.map((item) => (
          <StatusBarItem
            key={`${item.extensionId}-${item.id}`}
            text={item.text} icon={item.icon} tooltip={item.tooltip}
            command={item.command} onCommandInvoke={onCommandInvoke}
          />
        ))}
        {(cursorLine != null && cursorCol != null) && (
          <>
            <span>Ln {cursorLine}, Col {cursorCol}</span>
            <span aria-hidden className="w-px h-3 bg-[rgb(var(--border-default))]" />
          </>
        )}
        <span>{wordsLabel}</span>
        <span aria-hidden className="w-px h-3 bg-[rgb(var(--border-default))]" />
        <span>{Math.max(1, Math.ceil(wordCount / 220))} min read</span>
        {meterTokens != null && meterCostUsd != null && (
          <>
            <span aria-hidden className="w-px h-3 bg-[rgb(var(--border-default))]" />
            <span className="text-default" title="Tokens · cost (this run)">
              {meterTokens.toLocaleString()} tok · ${meterCostUsd.toFixed(2)}
            </span>
          </>
        )}
        <span aria-hidden className="w-px h-3 bg-[rgb(var(--border-default))]" />
        <div className="flex items-center">
          <button
            type="button"
            onClick={onToggleChat}
            aria-pressed={chatVisible}
            aria-label={chatVisible ? 'Hide chat' : 'Show chat'}
            title={chatVisible ? 'Hide chat (Ctrl+`)' : 'Show chat (Ctrl+`)'}
            className={`w-5 h-5 grid place-items-center rounded ${
              chatVisible ? 'bg-active text-default' : 'text-muted hover:bg-hover hover:text-default'
            }`}
          >
            <MessageSquare aria-hidden className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Open Settings"
            title="Open Settings"
            className="w-5 h-5 grid place-items-center rounded-sm text-muted hover:bg-hover hover:text-default"
          >
            <Settings aria-hidden className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  )
}
