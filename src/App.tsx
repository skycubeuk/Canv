import { useCallback, useEffect, useState } from 'react'
import { FloatingToolbar } from './components/FloatingToolbar'
import { AppOverlays } from './components/ide/AppOverlays'
import { BrowserUnsupportedBanner } from './components/BrowserUnsupportedBanner'
import { legacyStateExists } from './lib/legacyState'
import { WorkspaceShell } from './components/ide/WorkspaceShell'
import { useBottomPanelTabs } from './hooks/useBottomPanelTabs'
import { useFileHistoryRouting } from './hooks/useFileHistoryRouting'
import type { PaletteMode } from './components/ide/CommandPalette'
import type { Action as AgentDef } from './config/types'
import { isElectron } from './lib/fs'
import { TopBar } from './components/ide/TopBar'
import { ServicesProvider, useService } from './services'
import { Contributions } from './contributions'

// Side-effect imports: each contribution self-registers via
// registerContribution(). Importing them from a leaf (App.tsx, not
// contributions/index.ts) sidesteps a TDZ cycle: contributions import
// `registerContribution` from ./index, which would still be initializing
// if the side-effect imports lived next to the registry definition.
import './contributions/theme.contribution'
import './contributions/ollama.contribution'
import './contributions/quota-error.contribution'
import './contributions/idle-snapshot.contribution'
import './contributions/extension-keybindings.contribution'
import './contributions/commands.contribution'
import './contributions/dock-bridge.contribution'

function basename(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i >= 0 ? rel.slice(i + 1) : rel
}

export default function App() {
  const [migrationOpen, setMigrationOpen] = useState(() => isElectron() && legacyStateExists())
  if (!isElectron()) {
    return <BrowserUnsupportedBanner migrationOpen={migrationOpen} setMigrationOpen={setMigrationOpen} />
  }
  return (
    <ServicesProvider config={{ migrationOpen }}>
      <Contributions />
      <AppInner migrationOpen={migrationOpen} setMigrationOpen={setMigrationOpen} />
    </ServicesProvider>
  )
}

interface AppInnerProps {
  migrationOpen: boolean
  setMigrationOpen: (open: boolean) => void
}

function AppInner({ migrationOpen, setMigrationOpen }: AppInnerProps) {
  const workspace = useService('workspace')
  const ideLayout = useService('ideLayout')
  const modesSvc = useService('modes')
  const selectionAgent = useService('selectionAgent')

  const activeProfileId = modesSvc.profile ?? modesSvc.defaultModeId
  const activeProfile =
    modesSvc.modes.find((m) => m.id === activeProfileId) ??
    modesSvc.modes.find((m) => m.id === modesSvc.defaultModeId)!

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteMode, setPaletteMode] = useState<PaletteMode>('commands')
  const [pendingDocAgent, setPendingDocAgent] = useState<AgentDef | null>(null)

  // File-history UI state + dock-bridge plumbing.
  const { fileHistoryTarget, fileHistoryNonce, restoreTarget, openFileHistory, setRestoreTarget } = useFileHistoryRouting()

  // Bridge events from commands.contribution → App-local UI state.
  useEffect(() => {
    const onPaletteOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ mode: PaletteMode }>).detail
      if (!detail) return
      setPaletteMode(detail.mode); setPaletteOpen(true)
    }
    const onDocAgentPending = (e: Event) => {
      const detail = (e as CustomEvent<{ agent: AgentDef }>).detail
      if (!detail) return
      setPendingDocAgent(detail.agent)
    }
    window.addEventListener('canv:palette:open', onPaletteOpen)
    window.addEventListener('canv:docAgent:pending', onDocAgentPending)
    return () => {
      window.removeEventListener('canv:palette:open', onPaletteOpen)
      window.removeEventListener('canv:docAgent:pending', onDocAgentPending)
    }
  }, [])

  // Mirror the sidebar toggle: clicking the active placement collapses the
  // dock; clicking an inactive placement switches and ensures it's visible.
  const setBottomPlacement = useCallback((next: 'bottom' | 'right') => {
    const { visible, placement } = ideLayout.layout.bottom
    if (visible && placement === next) { ideLayout.toggleBottom(); return }
    ideLayout.setDockPlacement(next)
    if (!visible) ideLayout.toggleBottom()
  }, [ideLayout])

  const bottomPanelTabs = useBottomPanelTabs({
    fileHistoryTarget,
    fileHistoryNonce,
    onOpenRestore: setRestoreTarget,
  })

  return (
    <div className="h-full flex flex-col">
      {workspace.remoteStatus?.state === 'offline' && (
        <div className="bg-amber-900/40 text-amber-100 px-3 py-1.5 text-sm flex items-center justify-between border-b border-amber-800">
          <span>Remote workspace offline — attempting to reconnect…</span>
          <button type="button" onClick={() => workspace.reconnect()} className="underline hover:no-underline">
            Reconnect now
          </button>
        </div>
      )}
      <TopBar
        workspaceName={workspace.root}
        onOpenCommandPalette={() => { setPaletteMode('commands'); setPaletteOpen(true) }}
        profile={activeProfile}
        hasMarkdownTab={workspace.activeMarkdownRel != null}
        activeFileName={workspace.activeMarkdownRel ? basename(workspace.activeMarkdownRel) : null}
        onRunDocAgent={(agent, instruction) => selectionAgent.handleAgentOnDocument(workspace.activeGroupId, agent, instruction)}
        bottomVisible={ideLayout.layout.bottom.visible}
        bottomPlacement={ideLayout.layout.bottom.placement}
        onSetBottomPlacementBottom={() => setBottomPlacement('bottom')}
        onSetBottomPlacementRight={() => setBottomPlacement('right')}
      />
      <WorkspaceShell
        onOpenRestore={setRestoreTarget}
        onViewHistory={openFileHistory}
        bottomPanelTabs={bottomPanelTabs}
      />
      <FloatingToolbar onAgent={selectionAgent.handleAgentFromToolbar} />
      <AppOverlays
        migrationOpen={migrationOpen}
        onMigrationComplete={() => { setMigrationOpen(false); window.location.reload() }}
        pendingDocAgent={pendingDocAgent}
        onSubmitDocAgent={(instruction) => {
          selectionAgent.handleAgentOnDocument(workspace.activeGroupId, pendingDocAgent!, instruction)
          setPendingDocAgent(null)
        }}
        onCancelDocAgent={() => setPendingDocAgent(null)}
        paletteOpen={paletteOpen}
        paletteMode={paletteMode}
        onClosePalette={() => setPaletteOpen(false)}
        restoreTarget={restoreTarget}
        onCloseRestore={() => setRestoreTarget(null)}
      />
    </div>
  )
}
