import type { RunRecord } from '../components/ResultsPanel'
import type { ChatMessage } from '../components/ChatPanel'
import type { LintIssue } from './lintTypes'
import type { BottomTab } from '../hooks/useIdeLayout'
import type { Theme } from '../hooks/useSettings'

/** A run as broadcast to the pop-out, with main-side parsing already applied. */
export interface DockRun extends RunRecord {
  /** Parsed feedback section (from parseAgentResponse), if any. */
  parsedFeedback?: string
  /** Parsed rewrite section (from parseAgentResponse), if any. */
  parsedRewrite?: string
  /** Agent's outputMode, so the popout can choose section headings. */
  outputMode?: string
}

/** Snapshot of all dock-relevant state, broadcast from main → pop-out. */
export interface DockState {
  activeTab: BottomTab
  activeRunId: string | null
  runs: DockRun[]
  chatMessages: ChatMessage[]
  chatProvider: string
  chatModel: string
  chatBusy: boolean
  problems: LintIssue[]
  output: string
  streamingRunId: string | null
  ui: {
    theme: Theme
    accent: string
    fontSize: number
    profileLabel: string | null
  }
}

/** Messages dispatched from pop-out → main when the user interacts. */
export type UserAction =
  | { type: 'select-tab'; tabId: BottomTab }
  | { type: 'select-run'; runId: string | null }
  | { type: 'send-chat'; text: string }
  | { type: 'rerun-agent'; runId: string }
  | { type: 'delete-run'; runId: string }
  | { type: 'apply-run'; runId: string }
  | { type: 'refine-run'; runId: string; message: string }
  | { type: 'clear-chat' }
  | { type: 'stop-chat' }
  | { type: 'set-placement'; placement: 'bottom' | 'right' }

/** Bridge surface exposed by the Electron preload as `window.canvDock`. */
export interface CanvDockBridge {
  /** Called by main to open the pop-out window. Returns when the second window has loaded. */
  openPopout: () => Promise<void>
  /** Called by main to destroy the pop-out window. */
  closePopout: () => Promise<void>
  /** Called by main to push a state snapshot. No-op when no pop-out is open. */
  pushState: (state: DockState) => void
  /** Called by main to subscribe to user actions originating in the pop-out. */
  onUserAction: (cb: (action: UserAction) => void) => () => void
  /** Called by main to learn when the pop-out window closes (externally or via closePopout). */
  onPopoutClosed: (cb: () => void) => () => void
  /** Called by main to learn when the pop-out window has finished mounting. */
  onPopoutReady: (cb: () => void) => () => void

  // ----- pop-out side -----
  /** Called by pop-out to subscribe to state snapshots from main. */
  onState: (cb: (state: DockState) => void) => () => void
  /** Called by pop-out to send a user action to main. */
  sendAction: (action: UserAction) => void
  /** Called by pop-out once it has finished mounting; main responds with an immediate state snapshot. */
  ready: () => void
}

declare global {
  interface Window {
    canvDock?: CanvDockBridge
  }
}
