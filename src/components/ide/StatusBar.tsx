import { MessageSquare, Settings } from 'lucide-react'
import { useContributions } from '../../hooks/useContributions'
import { useService } from '../../services/useService'
import { StatusBarItem } from './StatusBarItem'

function basenameOrNull(p: string | null): string {
  if (!p) return ''
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i >= 0 ? p.slice(i + 1) : p
}

export function StatusBar() {
  const workspace = useService('workspace')
  const modesSvc = useService('modes')
  const chatSessions = useService('chatSessions')
  const editorStats = useService('editorStats')
  const ideLayout = useService('ideLayout')
  const profilePicker = useService('profilePicker')

  const saveState: 'saved' | 'unsaved' | 'saving' | 'conflict' = workspace.conflict
    ? 'conflict'
    : workspace.writingSet.size > 0
      ? 'saving'
      : workspace.dirtySet.size > 0
        ? 'unsaved'
        : 'saved'

  const activeProfileId = modesSvc.profile ?? modesSvc.defaultModeId
  const profile =
    modesSvc.modes.find((m) => m.id === activeProfileId) ??
    modesSvc.modes.find((m) => m.id === modesSvc.defaultModeId)!

  const workspaceName = workspace.root
  const { wordCount, selectionWordCount } = editorStats
  const { apiKeyMissing, meterTotals } = chatSessions
  const meterTokens = meterTotals.tokens || null
  const meterCostUsd = meterTotals.costUsd || null

  const onClickProfile = profilePicker.openSwitcher
  const onClickApiKeyWarning = () => workspace.openSettingsTab()
  const onOpenSettings = () => workspace.openSettingsTab()
  const chatVisible = ideLayout.layout.bottom.visible && ideLayout.layout.bottom.activeTab === 'chat'
  const onToggleChat = () => {
    const { visible, activeTab } = ideLayout.layout.bottom
    if (visible && activeTab === 'chat') {
      ideLayout.toggleBottom()
    } else {
      if (!visible) ideLayout.toggleBottom()
      ideLayout.showBottomTab('chat')
    }
  }

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
          className="text-warning-fg hover:opacity-80 transition-colors"
          title="No API key — click to open Settings"
        >
          ⚠ No API key
        </button>
      )}

      {saveState === 'saved' ? (
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-success" aria-hidden />
          <span>Saved</span>
        </span>
      ) : saveState === 'unsaved' ? (
        <span className="flex items-center gap-1.5 text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-border-default" aria-hidden />
          <span>Unsaved</span>
        </span>
      ) : saveState === 'saving' ? (
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-warning" aria-hidden />
          <span>Saving…</span>
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-danger-fg">
          <span className="w-1.5 h-1.5 rounded-full bg-danger" aria-hidden />
          <span>Conflict</span>
        </span>
      )}

      <span aria-hidden className="w-px h-3 bg-border-default" />

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
        <span className="truncate max-w-[260px]" title={workspaceName}>
          {basenameOrNull(workspaceName)}
        </span>
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
        <span>{wordsLabel}</span>
        <span aria-hidden className="w-px h-3 bg-border-default" />
        <span>{Math.max(1, Math.ceil(wordCount / 220))} min read</span>
        {meterTokens != null && meterCostUsd != null && (
          <>
            <span aria-hidden className="w-px h-3 bg-border-default" />
            <span className="text-default" title="Tokens · cost (this run)">
              {meterTokens.toLocaleString()} tok · ${meterCostUsd.toFixed(2)}
            </span>
          </>
        )}
        <span aria-hidden className="w-px h-3 bg-border-default" />
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
