import { useCallback, useEffect, useState } from 'react'
import { FloatingToolbar } from './components/FloatingToolbar'
import { AppOverlays } from './components/ide/AppOverlays'
import { BrowserUnsupportedBanner } from './components/BrowserUnsupportedBanner'
import { legacyStateExists } from './lib/legacyState'
import { WorkspaceShell } from './components/ide/WorkspaceShell'
import { useBottomPanelTabs } from './hooks/useBottomPanelTabs'
import { useFileHistoryRouting } from './hooks/useFileHistoryRouting'
import { usePaletteContent } from './hooks/usePaletteContent'
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
import './contributions/extension-engine-mismatch.contribution'
import './contributions/commands.contribution'
import './contributions/dock-bridge.contribution'
import './contributions/mcp.contribution'
import './contributions/extension-host-bridge.contribution'
import './contributions/tts.contribution'

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
  const selectionAgent = useService('selectionAgent')
  const suggestions = useService('suggestions')

  const contributions = useService('contributions')
  const commandsSvc = useService('commands')
  const { paletteFiles, paletteRecents } = usePaletteContent()

  const [pendingDocAgent, setPendingDocAgent] = useState<AgentDef | null>(null)

  // File-history UI state + dock-bridge plumbing.
  const { fileHistoryTarget, fileHistoryNonce, restoreTarget, openFileHistory, setRestoreTarget } = useFileHistoryRouting()

  // Bridge events from commands.contribution → App-local UI state.
  useEffect(() => {
    const onDocAgentPending = (e: Event) => {
      const detail = (e as CustomEvent<{ agent: AgentDef }>).detail
      if (!detail) return
      setPendingDocAgent(detail.agent)
    }
    window.addEventListener('canv:docAgent:pending', onDocAgentPending)
    return () => {
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
      <TopBar
        workspaceName={workspace.root}
        bottomVisible={ideLayout.layout.bottom.visible}
        bottomPlacement={ideLayout.layout.bottom.placement}
        onSetBottomPlacementBottom={() => setBottomPlacement('bottom')}
        onSetBottomPlacementRight={() => setBottomPlacement('right')}
        commands={commandsSvc.list()}
        files={paletteFiles}
        recentFiles={paletteRecents}
        extensionCommands={contributions.commands}
        onRunCommand={(id) => { commandsSvc.runById(id) }}
        onOpenFile={(rel) => { void workspace.openTab(rel) }}
        onInvokeExtensionCommand={(id) => { void window.canvExtensions?.invokeCommand?.(id) }}
      />
      <WorkspaceShell
        onOpenRestore={setRestoreTarget}
        onViewHistory={openFileHistory}
        bottomPanelTabs={bottomPanelTabs}
      />
      <FloatingToolbar
        onAgent={selectionAgent.handleAgentFromToolbar}
        onAddNote={(range, text) => suggestions.addUserAnnotation(range, text)}
      />
      <AppOverlays
        migrationOpen={migrationOpen}
        onMigrationComplete={() => { setMigrationOpen(false); window.location.reload() }}
        pendingDocAgent={pendingDocAgent}
        onSubmitDocAgent={(instruction) => {
          selectionAgent.handleAgentOnDocument(workspace.activeGroupId, pendingDocAgent!, instruction)
          setPendingDocAgent(null)
        }}
        onCancelDocAgent={() => setPendingDocAgent(null)}
        restoreTarget={restoreTarget}
        onCloseRestore={() => setRestoreTarget(null)}
      />
    </div>
  )
}
