import { useEffect, useMemo, useState } from 'react'
import { BottomPanel } from './BottomPanel'
import { DockPlacementMenu } from './DockPlacementMenu'
import { buildBottomPanelTabs, type BottomPanelTabsAdapter } from './bottomPanelTabs'
import { useDockBridge } from '../../hooks/useDockBridge'
import { useModesState } from '../../hooks/useModes'
import type { DockState, UserAction } from '../../lib/dockTypes'
import type { PendingApproval, ChatProvider } from '../ChatPanel'
import type { RunRecord } from '../ResultsPanel'
import type { LintIssue } from '../../lib/lintTypes'
import { applyAccent, applyTheme, resolveTheme } from '../../lib/accent'
import { DialogProvider } from '../../lib/dialogs'
import { ContextMenuProvider } from '../../lib/contextMenu'
import { getCanvHistory } from '../../lib/history'

/** Pop-out shell. Receives a state snapshot from the main window over the IPC
 *  bridge, builds a `BottomPanelTabsAdapter` whose handlers dispatch user
 *  actions back to main, and renders the same `BottomPanel` + tab components
 *  the main window uses. The only popout-specific affordance is the re-dock
 *  buttons in the header (`bottom` / `right`), which fold the panel back into
 *  the main window. */
export function DockPopoutBoot() {
  const modesState = useModesState()
  const bridge = useDockBridge({ mode: 'popout' })
  const [state, setState] = useState<DockState | null>(null)

  useEffect(() => {
    bridge.setStateHandler((s) => setState(s))
  }, [bridge])

  // Apply theme + accent to the popout's <html> via the same data-theme/CSS-var
  // mechanism the main window uses. Without this the popout has no data-theme
  // attribute and no --accent value, so every semantic token (bg-app, text-default,
  // accent rails) falls back to undefined and the window renders unstyled.
  useEffect(() => {
    if (!state) return
    applyTheme(resolveTheme(state.ui.theme))
    applyAccent(state.ui.accent)
  }, [state])

  // When theme === 'system', subscribe to prefers-color-scheme so OS dark-mode
  // toggles apply live (not only on the next state snapshot from main).
  const theme = state?.ui.theme
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (matches: boolean) => applyTheme(matches ? 'dark' : 'light')
    apply(mq.matches)
    const handler = (e: MediaQueryListEvent) => apply(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  // Reconstruct the Map<string, PendingApproval> from its entries form.
  // ChatPanel's prop type is Map<>; we serialise as entries because Maps don't
  // round-trip cleanly through every postMessage path.
  const pendingApprovalsMap = useMemo<Map<string, PendingApproval>>(() => {
    return new Map(state?.pendingApprovals ?? [])
  }, [state?.pendingApprovals])

  const adapter = useMemo<BottomPanelTabsAdapter | null>(() => {
    if (!state) return null
    const dispatch = (a: UserAction) => bridge.sendAction(a)

    // The bridge transports DockRun (extends RunRecord with parsed sections);
    // RunsTab/OutputTab consume RunRecord. The extra fields are ignored.
    const runs: RunRecord[] = state.runs

    return {
      runs,
      activeRunId: state.activeRunId,
      selectRun: (id: string) => dispatch({ type: 'select-run', runId: id }),
      closeRun: (id: string) => dispatch({ type: 'delete-run', runId: id }),
      // Apply on the popout side ignores the second arg: main resolves the
      // canonical replacement text from its parsed run cache, so popout-side
      // editing of a run's parsedRewrite isn't a concept.
      applyRun: (run: RunRecord) => dispatch({ type: 'apply-run', runId: run.id }),
      rerunRun: (run: RunRecord) => dispatch({ type: 'rerun-agent', runId: run.id }),
      refineRun: (run: RunRecord, message: string) => dispatch({ type: 'refine-run', runId: run.id, message }),

      chatMessages: state.chatMessages,
      chatBusy: state.chatBusy,
      chatProvider: state.chatProvider,
      chatModel: state.chatModel,
      sendChat: (text: string) => dispatch({ type: 'send-chat', text }),
      clearChat: () => dispatch({ type: 'clear-chat' }),
      stopChat: () => dispatch({ type: 'stop-chat' }),
      retryChat: (anchorId: string) => dispatch({ type: 'retry-chat', anchorId }),
      editAndRetryChat: (newText: string) => dispatch({ type: 'edit-and-retry-chat', newText }),
      pendingApprovals: pendingApprovalsMap,
      decideApproval: (callId, decision) => dispatch({ type: 'approval-decide', callId, decision }),
      followLatest: state.followLatest,
      setFollowLatest: (value: boolean) => dispatch({ type: 'set-follow-latest', value }),
      contextFileName: state.contextFileName,
      chatFontSize: state.chatFontSize,

      sessions: state.sessions,
      activeSessionId: state.activeSessionId,
      createSession: () => dispatch({ type: 'create-session' }),
      selectSession: (id: string) => dispatch({ type: 'select-session', id }),
      closeSession: (id: string) => dispatch({ type: 'close-session', id }),
      changeProviderModel: (provider: ChatProvider, model: string) =>
        dispatch({ type: 'change-provider-model', provider, model }),
      availableModels: state.availableModels,

      getSession: (id: string) => state.chatSessionsFull.find((s) => s.id === id) ?? null,
      chatSystemPreamble: state.chatSystemPreamble,

      problems: state.problems,
      lintScanState: state.lintScanState,
      lintScanError: state.lintScanError,
      scanProblems: () => dispatch({ type: 'scan-problems' }),
      clearProblems: () => dispatch({ type: 'clear-problems' }),
      jumpToProblem: (issue: LintIssue) => dispatch({ type: 'jump-to-problem', issue }),

      pricingOverrides: state.pricingOverrides,

      fileHistoryEnabled: state.revisionArchaeologyEnabled,
      fileHistoryTarget: state.fileHistoryTarget,
      fileHistoryNonce: state.fileHistoryNonce,
      fileHistoryHistory: state.revisionArchaeologyEnabled ? getCanvHistory() : null,
      onFileHistoryOpenDiff: (r) => dispatch({ type: 'file-history-open-diff', req: r }),
      onFileHistoryRestore: (r) => dispatch({ type: 'file-history-restore', snapshotId: r.snapshotId, relPath: r.relPath }),
    }
  }, [state, bridge, pendingApprovalsMap])

  const tabs = useMemo(() => (adapter ? buildBottomPanelTabs(adapter) : []), [adapter])

  // Modes config not yet ready (cold-load race) — show a placeholder. Same
  // gate the main window applies; without it RunsTab's useModes() would throw.
  if (modesState.status !== 'ready' || !state || !adapter) {
    return (
      <DialogProvider>
        <ContextMenuProvider>
          <div className="h-screen flex items-center justify-center text-muted text-sm">
            {modesState.status === 'error' ? 'Config error — open the main window.' : 'Connecting to main window…'}
          </div>
        </ContextMenuProvider>
      </DialogProvider>
    )
  }

  return (
    <DialogProvider>
      <ContextMenuProvider>
        <div
          className="h-screen flex flex-col bg-app"
          style={{ fontSize: state.ui.fontSize }}
        >
          <BottomPanel
            tabs={tabs}
            activeTab={state.activeTab}
            onSelectTab={(tab) => bridge.sendAction({ type: 'select-tab', tabId: tab })}
            headerRight={(
              <DockPlacementMenu
                placement="popout"
                canPopOut={false}
                placements={['bottom', 'right']}
                onChange={(next) => {
                  if (next === 'bottom' || next === 'right') {
                    bridge.sendAction({ type: 'set-placement', placement: next })
                  }
                }}
              />
            )}
          />
        </div>
      </ContextMenuProvider>
    </DialogProvider>
  )
}
