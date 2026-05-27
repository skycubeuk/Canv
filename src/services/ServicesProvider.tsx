import { useMemo, useRef, type ReactNode } from 'react'
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
import { useSuggestions } from '../hooks/useSuggestions'
import { useRecordings } from '../hooks/useRecordings'
import { useChatEditPreview } from '../hooks/useChatEditPreview'
import { useWorkspaceSetup } from '../hooks/useWorkspaceSetup'
import { getCanvHistory } from '../lib/history'
import { type AiEditHistoryClient } from '../lib/history/withAiEditSnapshot'
import { getFs } from '../lib/fs'
import { ServicesContext } from './useService'
import type { ICanvServices } from './index'

export interface ServicesProviderConfig {
  /** Whether the legacy-migration modal is open. Drives profile-picker auto-show. */
  migrationOpen?: boolean
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
  const settingsApi = useSettings({
    onDropped: (dropped) => {
      const list = dropped.join(', ')
      const noun = dropped.length === 1 ? 'setting' : 'settings'
      notifications.showToast(`${dropped.length} ${noun} reset to defaults: ${list}`)
    },
  })
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

  // Recordings — depends only on settingsApi/notifications/dialogs, so it
  // can be created before editorRegistry and passed in for the context menu.
  const ttsSettingsEarly = (settingsApi.settings as {
    tts?: {
      provider?: import('../lib/tts').TtsProvider
      apiKey?: string
      defaultVoiceId?: string
      defaultVoiceName?: string
      defaultModelId?: string
    }
  }).tts
  const recordings = useRecordings({
    getProvider: () => ttsSettingsEarly?.provider ?? 'elevenlabs',
    getApiKey: () => ttsSettingsEarly?.apiKey ?? '',
    getDefaultVoice: () => ({
      voiceId: ttsSettingsEarly?.defaultVoiceId ?? '',
      voiceName: ttsSettingsEarly?.defaultVoiceName ?? '',
    }),
    getDefaultModel: () => ttsSettingsEarly?.defaultModelId ?? 'eleven_multilingual_v2',
    getWorkspaceFileUrl: (file) => `canv-rec://recordings/${file}`,
    showToast: notifications.showToast,
    confirm: dialogs.confirm,
  })

  // Editor registry + everything that consumes it.
  const editorRegistryRaw = useEditorRegistry({ workspace, recordings })
  const onActiveEditorUpdate = useExtensionEventBridge(workspace.activeMarkdownRel)
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

  // Workspace-setup phase + config. Drives the RA-enabled flag and
  // therefore the historyClient passed into chatSessions.
  const setup = useWorkspaceSetup({
    workspaceReady: workspace.ready,
    workspaceRoot: workspace.root,
    fs: getFs(),
    // Stub when canvHistory is not exposed (e.g. dock popout / web build).
    // The hook only calls history.init when enableRA, so the stub is
    // unreachable in that path; this keeps the type happy.
    history: getCanvHistory() ?? { init: async () => ({ branch: 'canv-history', headCommit: '' }) },
    defaultModeId: modes.defaultModeId ?? 'fiction',
  })
  const raEnabled = setup.config?.revisionArchaeology.enabled === true
  const historyClient = raEnabled ? getCanvHistory() : null

  const suggestionsRef = useRef<ReturnType<typeof useSuggestions> | null>(null)

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
    historyClient,
    getSuggestions: () => suggestionsRef.current,
  })

  const suggestions = useSuggestions({
    getActiveEditor: editorRegistry.getActiveEditor,
    activeMarkdownRel: workspace.activeMarkdownRel,
    // canv-history client is a structural superset of AiEditHistoryClient.
    historyClient: historyClient as unknown as AiEditHistoryClient | null,
    flushAll: workspace.flushAll,
    saveActive: () => {
      const view = editorRegistry.getActiveEditor()
      const rel = workspace.activeMarkdownRel
      if (view && rel) workspace.saveTab(rel, view.state.doc.toString())
    },
    startSeededChat: chatSessions.startSeededChat,
    showChatTab: () => ideLayout.showBottomTab('chat'),
  })
  // eslint-disable-next-line react-hooks/refs -- suggestionsRef is read only at tool-run time (async user action), never during render; assigning here closes the one-render gap the useEffect version leaves, matching depsRef.current = deps in useSuggestions.ts
  suggestionsRef.current = suggestions

  const chatEditPreview = useChatEditPreview({
    pendingApprovals: chatSessions.pendingApprovals,
    onApprovalDecide: chatSessions.onApprovalDecide,
    getActiveEditor: editorRegistry.getActiveEditor,
    activeMarkdownRel: workspace.activeMarkdownRel,
  })

  // Extend the suggestions callbacks with the chat-edit approval resolvers.
  // Memoised so its identity is stable across renders (it feeds the services
  // useMemo below); recomputed only when suggestions or the resolvers change.
  const suggestionsWithEditPreview = useMemo(
    () => ({
      ...suggestions,
      callbacks: {
        ...suggestions.callbacks,
        approveEdit: chatEditPreview.approveEdit,
        rejectEdit: chatEditPreview.rejectEdit,
      },
    }),
    [suggestions, chatEditPreview.approveEdit, chatEditPreview.rejectEdit],
  )

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
    emitDiffSuggestion: suggestions.addDiffSuggestion,
    emitAnnotation: suggestions.addAnnotation,
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
    chatSessions: { ...chatSessions, inlinePreviewedCallId: chatEditPreview.previewedCallId },
    selectionAgent,
    suggestions: suggestionsWithEditPreview,
    recordings,
    lint,
    workspaceFileOps,
    editorStats,
    profilePicker,
    setup,
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
    chatEditPreview.previewedCallId,
    selectionAgent,
    suggestionsWithEditPreview,
    recordings,
    lint,
    workspaceFileOps,
    editorStats,
    profilePicker,
    setup,
  ])

  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>
}
