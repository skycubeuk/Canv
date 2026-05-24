import { DisposableStore, toDisposable } from '../lib/lifecycle'
import { parseAgentResponse } from '../agents/runner'
import { getActionById, getModeById } from '../hooks/useModes'
import { buildChatSystemPreamble } from '../lib/buildChatSystemPreamble'
import { getAdapter, configuredProviders, type Provider } from '../adapters'
import { flattenTree } from '../lib/fs'
import type { ChatProvider, PendingApproval } from '../components/ChatPanel'
import type { DockRun, DockState, UserAction } from '../lib/dockTypes'
import { registerContribution, subscribeServicesChange, type Contribution } from './index'

/**
 * Replaces useDockBridgeMain.
 *
 * The dock bridge is the IPC seam between the main window and the pop-out
 * dock window. It (a) projects the live UI state into a structured-clone-safe
 * snapshot and pushes it through `window.canvDock.pushState`, and (b) routes
 * user actions arriving from the pop-out through the same handlers the in-app
 * UI uses.
 *
 * Almost every piece of dock state lives in a service today (selectionAgent,
 * chatSessions, ideLayout, lint, modes, workspace, contributions, settings),
 * so this contribution reads them via `services.<X>` and re-derives the
 * snapshot whenever services identity changes — exactly the broadcast cadence
 * the old `useEffect(broadcast, [dockState])` had.
 *
 * Three values still live in AppInner state and travel through CustomEvent
 * seams, mirroring the pattern used by commands.contribution for palette
 * mode + pendingDocAgent:
 *
 *   - 'canv:dockBridge:appProps' { detail: { fileHistoryTarget, fileHistoryNonce, revisionArchaeologyEnabled } }
 *       App → contribution. The contribution stores the latest payload and
 *       re-broadcasts so the popout sees the change immediately. Without
 *       this, the contribution would only see App-local state at its own
 *       re-register cadence, which is driven by services identity.
 *
 *   - 'canv:fileHistory:openRequest' { detail: { relPath } }
 *   - 'canv:fileHistory:openDiff' { detail: { req } }
 *   - 'canv:fileHistory:restore' { detail: { snapshotId, relPath } }
 *       Contribution → App. AppInner listens and updates its local state.
 *
 * Throttling: the legacy useDockBridge hook coalesced pushState() to ~30fps.
 * The contribution implements the same throttle inline rather than calling
 * the hook (contributions don't get to call hooks), keeping
 * `window.canvDock.pushState` as the only IPC primitive.
 */

const THROTTLE_MS = 33 // ~30fps

interface AppProps {
  fileHistoryTarget: string | null
  fileHistoryNonce: number
  revisionArchaeologyEnabled: boolean
}

// Module-level latest AppProps, set by App via the 'canv:dockBridge:appProps'
// CustomEvent. Module-scope is fine because there's only ever one main
// window's worth of AppInner; the dock bridge is per-process.
let latestAppProps: AppProps = {
  fileHistoryTarget: null,
  fileHistoryNonce: 0,
  revisionArchaeologyEnabled: false,
}

// Module-scope memory of the last placement/visible we acted on. The legacy
// hook's open/close effect deps were [dockBridge, placement, visible], so it
// only fired when those actually changed. Contributions re-register on every
// services identity change (~each render during streaming), so we de-dup
// here to avoid spamming `openPopout()` (which focus()es the popout window).
let lastActedPopoutOpen: boolean | null = null

export const dockBridge: Contribution = {
  name: 'dock-bridge',
  register(services) {
    const store = new DisposableStore()
    const bridge = typeof window !== 'undefined' ? window.canvDock : undefined

    // Always wire the CustomEvent → latestAppProps listener so App.tsx's
    // dispatch keeps the module in sync even before the bridge is available
    // (the listener also triggers a broadcast when ready).
    const onAppProps = (e: Event) => {
      const detail = (e as CustomEvent<AppProps>).detail
      if (!detail) return
      latestAppProps = detail
      // Re-broadcast immediately so the popout sees the change without
      // waiting for the next services-identity tick.
      pushNow()
    }
    window.addEventListener('canv:dockBridge:appProps', onAppProps)
    store.add(toDisposable(() => window.removeEventListener('canv:dockBridge:appProps', onAppProps)))

    if (!bridge) {
      // Browser build (no Electron preload): nothing else to wire. The
      // CustomEvent listener above is harmless and gets disposed normally.
      return store
    }

    // ---- Throttled pushState ----
    let lastSendAt = 0
    let pending: DockState | null = null
    let trailingTimer: ReturnType<typeof setTimeout> | null = null

    const broadcastState = (state: DockState) => {
      const now = Date.now()
      const delta = now - lastSendAt
      if (delta >= THROTTLE_MS) {
        lastSendAt = now
        pending = null
        bridge.pushState(state)
        return
      }
      pending = state
      if (trailingTimer == null) {
        trailingTimer = setTimeout(() => {
          trailingTimer = null
          const next = pending
          pending = null
          if (next) {
            lastSendAt = Date.now()
            bridge.pushState(next)
          }
        }, THROTTLE_MS - delta)
      }
    }

    store.add(toDisposable(() => {
      if (trailingTimer) clearTimeout(trailingTimer)
      trailingTimer = null
      pending = null
    }))

    // ---- Snapshot builder ----
    // Reads exclusively from `services` + module-level App-prop state.
    // Recomputed every time we broadcast; services identity changes drive
    // re-registration (and a fresh broadcast), and CustomEvent updates
    // trigger an explicit broadcast.
    const buildDockState = (): DockState => {
      const { selectionAgent, chatSessions, ideLayout, lint, modes, workspace, contributions, settings } = services
      const settingsObj = settings.settings

      const activeProfileId = modes.profile ?? modes.defaultModeId
      const activeProfile =
        modes.modes.find((m) => m.id === activeProfileId) ??
        modes.modes.find((m) => m.id === modes.defaultModeId)!

      // Parse each run on the main side so the popout can render Notes /
      // Rewrite / Diff sections without needing useModes() of its own.
      const dockRuns: DockRun[] = selectionAgent.runs.map((r) => {
        const mode = getModeById(modes.modes, r.modeId) ?? getModeById(modes.modes, modes.defaultModeId)
        const agent = mode ? getActionById(mode, r.agentId) : null
        if (!agent) return { ...r }
        const parsed = parseAgentResponse(agent, r.response)
        return {
          ...r,
          parsedFeedback: parsed.feedback,
          parsedRewrite: parsed.rewrite,
          outputMode: agent.outputMode,
        }
      })

      const pendingApprovalsArr: Array<[string, PendingApproval]> = Array.from(
        chatSessions.pendingApprovals.entries(),
      )

      // availableModels — mirrors the App.tsx useMemo.
      const visible = new Set<Provider>(
        configuredProviders({
          apiKeys: settingsObj.apiKeys,
          baseUrls: settingsObj.baseUrls,
          ollamaModels: settingsObj.ollamaModels,
        }),
      )
      if (chatSessions.chatMessages.length > 0) visible.add(chatSessions.chatProvider as Provider)
      if (visible.size === 0) {
        ;(['anthropic', 'openai', 'ollama'] as Provider[]).forEach((p) => visible.add(p))
      }
      const availableModels = {} as Record<ChatProvider, string[]>
      for (const id of visible) {
        availableModels[id as ChatProvider] = id === 'ollama'
          ? settingsObj.ollamaModels
          : getAdapter(id).models
      }

      const bottomDockExtensionPanels = contributions.panels
        .filter((p) => p.location === 'bottom-dock')
        .map((p) => ({ extensionId: p.extensionId, id: p.id, title: p.title }))

      const activeRel = workspace.activeMarkdownRel
      const contextFileName = activeRel
        ? (activeRel.lastIndexOf('/') >= 0 ? activeRel.slice(activeRel.lastIndexOf('/') + 1) : activeRel)
        : null

      const streamingRunId = dockRuns.find((r) => r.status === 'streaming' || r.status === 'refining')?.id ?? null

      const workspaceFiles = workspace.tree
        ? flattenTree(workspace.tree)
            .filter((n) => n.kind === 'file')
            .map((n) => n.relPath)
            .sort()
        : []

      return {
        activeTab: ideLayout.layout.bottom.activeTab,
        activeRunId: selectionAgent.activeTabId,
        runs: dockRuns,
        chatMessages: chatSessions.chatMessages,
        chatProvider: chatSessions.chatProvider,
        chatModel: chatSessions.chatModel,
        chatBusy: chatSessions.chatBusy,
        pendingApprovals: pendingApprovalsArr,
        followLatest: chatSessions.followLatest,
        contextFileName,
        chatFontSize: settingsObj.chatFontSize,
        pricingOverrides: settingsObj.pricingOverrides,
        sessions: chatSessions.sessions,
        chatSessionsFull: chatSessions.allSessions,
        chatSystemPreamble: buildChatSystemPreamble({ activeProfile }),
        activeSessionId: chatSessions.activeId,
        availableModels,
        workspaceFiles,
        revisionArchaeologyEnabled: latestAppProps.revisionArchaeologyEnabled,
        fileHistoryTarget: latestAppProps.fileHistoryTarget,
        fileHistoryNonce: latestAppProps.fileHistoryNonce,
        problems: lint.issues,
        lintScanState: lint.scanState,
        lintScanError: lint.scanError,
        bottomDockExtensionPanels,
        streamingRunId,
        ui: {
          theme: settingsObj.theme as import('../lib/themes').ThemeId,
          fontSize: settingsObj.fontSize,
          profileLabel: activeProfile?.label ?? null,
        },
      }
    }

    const pushNow = () => {
      try {
        broadcastState(buildDockState())
      } catch (e) {
        // Don't take down the whole contribution loader if a service is
        // momentarily inconsistent during a reload. The next services tick
        // will produce a clean snapshot.
        console.warn('[dock-bridge] failed to build snapshot:', e)
      }
    }

    // ---- IPC listener: user actions from the pop-out ----
    const offAction = bridge.onUserAction((action: UserAction) => {
      const { selectionAgent, chatSessions, ideLayout, lint, editorRegistry } = services
      switch (action.type) {
        case 'select-tab':
          ideLayout.setBottomTab(action.tabId)
          return
        case 'select-run':
          selectionAgent.setActiveTabId(action.runId)
          return
        case 'rerun-agent': {
          const run = selectionAgent.runs.find((r) => r.id === action.runId)
          if (run) selectionAgent.handleRerun(run)
          return
        }
        case 'delete-run':
          selectionAgent.handleCloseTab(action.runId)
          return
        case 'apply-run': {
          const run = selectionAgent.runs.find((r) => r.id === action.runId)
          if (!run) return
          // Re-parse the run to recover parsedRewrite, matching the old hook's
          // dockRuns lookup. Keeps apply text identical to what the popout shows.
          const mode = getModeById(services.modes.modes, run.modeId)
            ?? getModeById(services.modes.modes, services.modes.defaultModeId)
          const agent = mode ? getActionById(mode, run.agentId) : null
          const parsed = agent ? parseAgentResponse(agent, run.response) : { rewrite: undefined }
          const text = parsed.rewrite ?? run.response
          if (text) selectionAgent.handleApply(run, text)
          return
        }
        case 'refine-run': {
          const run = selectionAgent.runs.find((r) => r.id === action.runId)
          if (run) void selectionAgent.refineRun(run, action.message)
          return
        }
        case 'send-chat':
          void chatSessions.sendChat(action.text)
          return
        case 'clear-chat':
          chatSessions.clearChat()
          return
        case 'stop-chat':
          chatSessions.stopChat()
          return
        case 'retry-chat':
          chatSessions.retryFromAnchor(action.anchorId)
          return
        case 'edit-and-retry-chat':
          chatSessions.editAndRetry(action.newText)
          return
        case 'approval-decide':
          chatSessions.onApprovalDecide(action.callId, action.decision)
          return
        case 'set-follow-latest':
          chatSessions.setFollowLatest(action.value)
          return
        case 'create-session':
          chatSessions.createSession()
          return
        case 'select-session':
          chatSessions.selectSession(action.id)
          return
        case 'close-session':
          chatSessions.closeSession(action.id)
          return
        case 'change-provider-model':
          chatSessions.setActiveSessionProviderModel(action.provider, action.model)
          return
        case 'scan-problems':
          void lint.scanWorkspace()
          return
        case 'clear-problems':
          lint.clearWorkspaceIssues()
          return
        case 'jump-to-problem':
          editorRegistry.jumpToProblem(action.issue, lint.issues)
          return
        case 'open-file-history':
          window.dispatchEvent(new CustomEvent('canv:fileHistory:openRequest', {
            detail: { relPath: action.relPath },
          }))
          return
        case 'file-history-open-diff':
          window.dispatchEvent(new CustomEvent('canv:fileHistory:openDiff', {
            detail: { req: action.req },
          }))
          return
        case 'file-history-restore':
          window.dispatchEvent(new CustomEvent('canv:fileHistory:restore', {
            detail: { snapshotId: action.snapshotId, relPath: action.relPath },
          }))
          return
        case 'set-placement':
          ideLayout.setDockPlacement(action.placement)
          return
      }
    })
    store.add(toDisposable(offAction))

    // ---- IPC listener: pop-out ready (replay latest snapshot) ----
    const offReady = bridge.onPopoutReady(() => {
      // Force-send immediately (bypass throttle delta) so the freshly mounted
      // window doesn't render empty before the next state change.
      lastSendAt = 0
      pushNow()
    })
    store.add(toDisposable(offReady))

    // ---- IPC listener: pop-out closed (guarded revert) ----
    // The popout's `closed` event fires for both external closes and
    // renderer-initiated closes. Only revert when placement is STILL 'popout'
    // at the time the close arrives. We read placement at fire time from
    // services, so the guard remains correct without a React ref.
    const offClosed = bridge.onPopoutClosed(() => {
      const { ideLayout } = services
      if (ideLayout.layout.bottom.placement === 'popout' && ideLayout.layout.bottom.visible) {
        ideLayout.toggleBottom()
      }
    })
    store.add(toDisposable(offClosed))

    // ---- Open / close pop-out based on placement + visibility ----
    // Re-evaluated on every services-change tick. De-duped against the last
    // acted value so openPopout() (which focuses the window) doesn't spam.
    const evaluatePopoutOpen = () => {
      const { placement: bottomPlacement, visible: bottomVisible } = services.ideLayout.layout.bottom
      const shouldOpen = bottomPlacement === 'popout' && bottomVisible
      if (lastActedPopoutOpen !== shouldOpen) {
        lastActedPopoutOpen = shouldOpen
        if (shouldOpen) {
          void bridge.openPopout()
        } else {
          void bridge.closePopout()
        }
      }
    }
    evaluatePopoutOpen()

    // ---- React to services identity changes ----
    // Contributions register once (see Contributions.tsx). To keep the broadcast
    // cadence the legacy useEffect(broadcast, [dockState]) provided, we
    // subscribe to the services-change event and re-broadcast + re-evaluate
    // pop-out open/close on each tick.
    store.add(subscribeServicesChange(() => {
      evaluatePopoutOpen()
      pushNow()
    }))

    // ---- Initial broadcast on register ----
    pushNow()

    return store
  },
}

registerContribution(dockBridge)
