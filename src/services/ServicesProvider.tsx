import { useMemo, type ReactNode } from 'react'
import { useDialogs } from '../lib/dialogs'
import { useNotifications } from '../hooks/useNotifications'
import { useSettings } from '../hooks/useSettings'
import { useModes } from '../hooks/useModes'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { useWorkspace } from '../hooks/useWorkspace'
import { useWorkspaceFileOps } from '../hooks/useWorkspaceFileOps'
import { useIdeLayout } from '../hooks/useIdeLayout'
import { useCommands } from '../hooks/useCommands'
import { useContributions } from '../hooks/useContributions'
import { useEditorRegistry } from '../hooks/useEditorRegistry'
import { useExtensionEventBridge } from '../hooks/useExtensionEventBridge'
import { useEditorStats } from '../hooks/useEditorStats'
import { useLintIssues } from '../hooks/useLintIssues'
import { useProfilePicker } from '../hooks/useProfilePicker'
import { useChatSessions } from '../hooks/useChatSessions'
import { useSelectionAgent } from '../hooks/useSelectionAgent'
import type { CanvHistory } from '../lib/history'
import { ServicesContext } from './useService'
import type { ICanvServices } from './index'

export interface ServicesProviderConfig {
  /** Whether the legacy-migration modal is open. Drives profile-picker auto-show. */
  migrationOpen?: boolean
  /** Resolved CanvHistory client for chat tool calls; null when revision-archaeology is off. */
  historyClient?: CanvHistory | null
}

export interface ServicesProviderProps {
  children: ReactNode
  config?: ServicesProviderConfig
}

/**
 * ServicesProvider owns one call to every hook listed in ICanvServices.
 * Outputs flow into later hooks' configs through this scope (NOT via
 * useService — that would require services to exist before they're
 * built). The hook order encodes the dep graph.
 *
 * In Task 2 the provider is dormant: App.tsx still calls every hook
 * itself. Consumers migrate to useService(...) one at a time in later
 * tasks, at which point the duplicated calls in App.tsx are removed.
 */
export function ServicesProvider({ children, config = {} }: ServicesProviderProps) {
  // Independent leaves first.
  const dialogs = useDialogs()
  const notifications = useNotifications()
  const settingsApi = useSettings()
  const modes = useModes()
  const [profile, setProfile] = useLocalStorage<string | null>('canv:profile', null)

  // Workspace + workspace-dependent layers.
  const workspace = useWorkspace({ onToast: notifications.showToast })
  const workspaceFileOps = useWorkspaceFileOps({
    workspace,
    dialogs,
    showToast: notifications.showToast,
  })
  const ideLayout = useIdeLayout(workspace.root)
  const commands = useCommands()
  const contributions = useContributions()

  // Editor registry + everything that consumes it.
  const editorRegistryRaw = useEditorRegistry({ workspace })
  const onActiveEditorUpdate = useExtensionEventBridge()
  const editorRegistry = useMemo(
    () => ({ ...editorRegistryRaw, onActiveEditorUpdate }),
    [editorRegistryRaw, onActiveEditorUpdate],
  )
  const activeEditor = editorRegistry.getActiveEditor()
  const editorStats = useEditorStats(activeEditor)
  const lint = useLintIssues({
    openSources: editorRegistry.openSources,
    tree: workspace.tree,
    opts: settingsApi.settings.lintRules,
  })

  const profilePicker = useProfilePicker({
    profile,
    setProfile,
    workspaceReady: workspace.ready,
    workspaceRoot: workspace.root,
    migrationOpen: config.migrationOpen ?? false,
  })

  // Resolve the active mode the same way App.tsx does, so chatSessions
  // and selectionAgent see an identical activeProfile / activeProfileId.
  const activeProfileId = profile ?? modes.defaultModeId
  const activeProfile =
    modes.modes.find((m) => m.id === activeProfileId) ??
    modes.modes.find((m) => m.id === modes.defaultModeId)!

  const chatSessions = useChatSessions({
    settings: settingsApi.settings,
    update: settingsApi.update,
    workspace,
    activeProfile,
    getActiveEditor: editorRegistry.getActiveEditor,
    showToast: notifications.showToast,
    openSettingsTab: workspace.openSettingsTab,
    showRetryUndoToast: notifications.showRetryUndoToast,
    dismissRetryUndo: notifications.dismissRetryUndo,
    dialogs,
    historyClient: config.historyClient ?? null,
  })

  const selectionAgent = useSelectionAgent({
    settings: settingsApi.settings,
    modelForAgent: settingsApi.modelForAgent,
    activeProfile,
    activeProfileId,
    workspace,
    getActiveEditor: editorRegistry.getActiveEditor,
    getActiveEditorForGroup: editorRegistry.getActiveEditorForGroup,
    showToast: notifications.showToast,
    openSettingsTab: workspace.openSettingsTab,
    showBottomTab: ideLayout.showBottomTab,
  })

  const services = useMemo<ICanvServices>(() => ({
    workspace,
    settings: settingsApi,
    editorRegistry,
    commands,
    contributions,
    dialogs,
    notifications,
    ideLayout,
    modes: { ...modes, profile, setProfile },
    chatSessions,
    selectionAgent,
    lint,
    workspaceFileOps,
    editorStats,
    profilePicker,
  }), [
    workspace,
    settingsApi,
    editorRegistry,
    commands,
    contributions,
    dialogs,
    notifications,
    ideLayout,
    modes,
    profile,
    setProfile,
    chatSessions,
    selectionAgent,
    lint,
    workspaceFileOps,
    editorStats,
    profilePicker,
  ])

  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>
}
