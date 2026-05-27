import type { useWorkspace } from '../hooks/useWorkspace'
import type { useSettings } from '../hooks/useSettings'
import type { useEditorRegistry } from '../hooks/useEditorRegistry'
import type { useCommands } from '../hooks/useCommands'
import type { useContributions } from '../hooks/useContributions'
import type { useDialogs } from '../lib/dialogs'
import type { useNotifications } from '../hooks/useNotifications'
import type { useIdeLayout } from '../hooks/useIdeLayout'
import type { useModes } from '../hooks/useModes'
import type { useChatSessions } from '../hooks/useChatSessions'
import type { useSelectionAgent } from '../hooks/useSelectionAgent'
import type { useSuggestions } from '../hooks/useSuggestions'
import type { useLintIssues } from '../hooks/useLintIssues'
import type { useWorkspaceFileOps } from '../hooks/useWorkspaceFileOps'
import type { useEditorStats } from '../hooks/useEditorStats'
import type { useProfilePicker } from '../hooks/useProfilePicker'
import type { useExtensionEventBridge } from '../hooks/useExtensionEventBridge'
import type { useWorkspaceSetup } from '../hooks/useWorkspaceSetup'
import type { useRecordings } from '../hooks/useRecordings'

/**
 * The full service registry exposed to React components via useService(...)
 * and to contributions via Contribution.register(services).
 *
 * Service shapes use ReturnType<typeof useX> so they track the underlying
 * hook automatically. Promote to a hand-written interface only when the
 * implementation outgrows its hook origin.
 */
export interface ICanvServices {
  workspace: ReturnType<typeof useWorkspace>
  settings: ReturnType<typeof useSettings>
  editorRegistry: ReturnType<typeof useEditorRegistry> & {
    /**
     * Forwards CodeMirror active-editor update events to extensions via
     * `window.canvExtensionsDev.fireEvent`. Composed onto the registry by
     * ServicesProvider so consumers can read it via `useService('editorRegistry')`
     * instead of holding a top-level callback in App.tsx.
     */
    onActiveEditorUpdate: ReturnType<typeof useExtensionEventBridge>
  }
  commands: ReturnType<typeof useCommands>
  contributions: ReturnType<typeof useContributions>
  dialogs: ReturnType<typeof useDialogs>
  notifications: ReturnType<typeof useNotifications>
  ideLayout: ReturnType<typeof useIdeLayout>
  modes: ReturnType<typeof useModes> & {
    profile: string | null
    setProfile: (p: string | null) => void
  }
  chatSessions: ReturnType<typeof useChatSessions> & {
    /**
     * The callId of the approval that is currently shown as an inline diff
     * preview in the active editor. Null when no inline preview is active.
     * Used by useBottomPanelTabs to suppress the duplicate approval card.
     */
    inlinePreviewedCallId: string | null
  }
  selectionAgent: ReturnType<typeof useSelectionAgent>
  suggestions: ReturnType<typeof useSuggestions>
  recordings: ReturnType<typeof useRecordings>
  lint: ReturnType<typeof useLintIssues>
  workspaceFileOps: ReturnType<typeof useWorkspaceFileOps>
  editorStats: ReturnType<typeof useEditorStats>
  profilePicker: ReturnType<typeof useProfilePicker>
  setup: ReturnType<typeof useWorkspaceSetup>
}

export { ServicesProvider } from './ServicesProvider'
export { ServicesContext, useService, useAllServices } from './useService'
