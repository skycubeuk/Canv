import { Folder, Search, GitBranch, PanelRight, PanelBottom } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { SidebarTab, InAppDockPlacement } from '../../hooks/useIdeLayout'
import { DocumentAgentMenu } from '../DocumentAgentMenu'
import type { Action, Mode } from '../../config/types'

interface Props {
  workspaceName: string | null
  activeSidebarTab: SidebarTab
  onSelectSidebarTab: (tab: SidebarTab) => void
  onOpenCommandPalette: () => void
  profile: Mode
  hasMarkdownTab: boolean
  activeFileName: string | null
  onRunDocAgent: (agent: Action, instruction?: string) => void
  sidebarVisible: boolean
  bottomVisible: boolean
  bottomPlacement: InAppDockPlacement | 'popout'
  onSetBottomPlacementBottom: () => void
  onSetBottomPlacementRight: () => void
  gitBadge?: string | null
}

interface SectionTab {
  id: SidebarTab
  label: string
  icon: LucideIcon
  badge?: string | null
}

export function TopBar(props: Props) {
  const {
    workspaceName, activeSidebarTab, onSelectSidebarTab,
    onOpenCommandPalette, profile, hasMarkdownTab, activeFileName, onRunDocAgent,
    sidebarVisible, bottomVisible, bottomPlacement,
    onSetBottomPlacementBottom, onSetBottomPlacementRight,
    gitBadge,
  } = props

  const sectionTabs: SectionTab[] = [
    { id: 'files', label: 'Files', icon: Folder },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'git', label: 'Git', icon: GitBranch, badge: gitBadge ?? null },
  ]

  const displayName = workspaceName
    ? (workspaceName.split(/[\\/]/).filter(Boolean).pop() ?? workspaceName)
    : null

  return (
    <header
      role="banner"
      className="shrink-0 h-10 flex items-center gap-1.5 px-2.5 bg-panel border-b border-default text-[12px]"
    >
      {/* Identity cluster */}
      <div className="flex items-center gap-2 pr-2">
        <span
          aria-hidden
          className="w-[18px] h-[18px] rounded-[5px] grid place-items-center text-accent-fg font-bold text-[10px]"
          style={{
            background: 'linear-gradient(135deg, rgb(var(--accent)), color-mix(in oklab, rgb(var(--accent)) 60%, black))',
            boxShadow: '0 0 0 1px color-mix(in oklab, rgb(var(--accent)) 40%, transparent)',
          }}
        >
          C
        </span>
        <span className="font-medium text-default">Canv</span>
        <span aria-hidden className="text-subtle">·</span>
        <span className="text-muted truncate max-w-[180px]" title={workspaceName ?? ''}>
          {displayName || 'No workspace'}
        </span>
      </div>

      {/* Section nav */}
      <div className="flex items-center gap-0.5 ml-1.5">
        {sectionTabs.map((t) => {
          const isActive = t.id === activeSidebarTab && sidebarVisible
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelectSidebarTab(t.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium ${
                isActive ? 'bg-active text-default' : 'text-muted hover:bg-hover'
              }`}
            >
              <t.icon aria-hidden className="w-3.5 h-3.5" />
              <span>{t.label}</span>
              {t.badge != null && t.badge !== '' && (
                <span className="text-[10px] px-1.5 py-px rounded bg-elev text-muted">{t.badge}</span>
              )}
            </button>
          )
        })}
      </div>

      <div className="flex-1" />

      {/* Command palette button */}
      <button
        type="button"
        onClick={onOpenCommandPalette}
        className="flex items-center gap-2 min-w-[280px] px-2.5 py-1 bg-elev border border-default rounded-md text-muted hover:bg-hover"
        aria-label="Find files, symbols, commands"
      >
        <Search aria-hidden className="w-3 h-3" />
        <span className="text-left">Find files, symbols, commands…</span>
        <span className="ml-auto text-[10px] px-1.5 py-px rounded bg-app border border-default font-mono text-subtle">⌘K</span>
      </button>

      <div className="flex-1" />

      {/* Run-on-document — single accent button that opens the agent picker */}
      <DocumentAgentMenu
        profile={profile}
        hasMarkdownTab={hasMarkdownTab}
        activeFileName={activeFileName}
        onRunAgent={onRunDocAgent}
      />

      <span aria-hidden className="w-px h-[18px] bg-[rgb(var(--border-default))] mx-1" />

      {/* Dock placement toggles. Sidebar visibility is driven by the
          Files/Search/Git tabs (re-clicking the active tab collapses). */}
      <button
        type="button"
        aria-label="Panel right (dock to right)"
        aria-pressed={bottomVisible && bottomPlacement === 'right'}
        onClick={onSetBottomPlacementRight}
        className={`w-7 h-7 grid place-items-center rounded-md ${
          bottomVisible && bottomPlacement === 'right' ? 'bg-active text-default' : 'text-muted hover:bg-hover'
        }`}
      >
        <PanelRight aria-hidden className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        aria-label="Panel bottom (dock to bottom)"
        aria-pressed={bottomVisible && bottomPlacement === 'bottom'}
        onClick={onSetBottomPlacementBottom}
        className={`w-7 h-7 grid place-items-center rounded-md ${
          bottomVisible && bottomPlacement === 'bottom' ? 'bg-active text-default' : 'text-muted hover:bg-hover'
        }`}
      >
        <PanelBottom aria-hidden className="w-3.5 h-3.5" />
      </button>
    </header>
  )
}
