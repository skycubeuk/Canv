import { useEffect, useRef } from 'react'
import { isElectron } from '../lib/fs'
import { SETTINGS_TAB_KEY } from '../lib/tabKey'
import type { Action as AgentDef } from '../config/types'
import type { useCommands } from './useCommands'
import type { useIdeLayout } from './useIdeLayout'
import type { useWorkspace } from './useWorkspace'
import type { useDialogs } from '../lib/dialogs'
import type { EditorGroupId } from '../types/workspace'
import type { PaletteMode } from '../components/ide/CommandPalette'

type CommandsApi = ReturnType<typeof useCommands>
type IdeLayoutApi = ReturnType<typeof useIdeLayout>
type WorkspaceApi = ReturnType<typeof useWorkspace>
type DialogsApi = ReturnType<typeof useDialogs>

export interface UseAppCommandsArgs {
  commands: CommandsApi
  ideLayout: IdeLayoutApi
  workspace: WorkspaceApi
  activeProfile: { actions: AgentDef[] }
  dialogs: DialogsApi
  openSettingsTab: () => void
  openSwitcher: () => void
  changeWorkspace: () => Promise<void>
  openRemoteWorkspace: () => Promise<void>
  handleExport: (fmt: 'txt' | 'md') => void
  getActiveEditor: () => import('@codemirror/view').EditorView | null
  handleAgentOnDocument: (groupId: EditorGroupId, agent: AgentDef, instruction?: string) => void
  setPaletteMode: (m: PaletteMode) => void
  setPaletteOpen: (open: boolean) => void
  setPendingDocAgent: (agent: AgentDef | null) => void
}

export function useAppCommands(args: UseAppCommandsArgs): void {
  const {
    commands, ideLayout, workspace, activeProfile, dialogs,
    openSettingsTab, openSwitcher,
    changeWorkspace, openRemoteWorkspace,
    handleExport, getActiveEditor,
    handleAgentOnDocument,
    setPaletteMode, setPaletteOpen,
    setPendingDocAgent,
  } = args

  // ---- The big command-registration effect ----
  useEffect(() => {
    const disposers: Array<() => void> = []
    const reg = (cmd: Parameters<typeof commands.register>[0]) => disposers.push(commands.register(cmd))

    reg({
      id: 'view.toggleSidebar', label: 'View: Toggle Sidebar', group: 'View',
      shortcut: 'Ctrl+B', run: () => ideLayout.toggleSidebar(),
    })
    reg({
      id: 'view.toggleBottomPanel', label: 'View: Toggle Bottom Panel', group: 'View',
      shortcut: 'Ctrl+`', runInEditable: true,
      run: () => ideLayout.toggleBottom(),
    })
    reg({
      id: 'view.focusSearchTab', label: 'View: Focus Search', group: 'View',
      shortcut: 'Ctrl+Shift+F', runInEditable: true,
      run: () => { ideLayout.setSidebarTab('search'); if (!ideLayout.layout.sidebar.visible) ideLayout.toggleSidebar() },
    })
    reg({
      id: 'view.focusFilesTab', label: 'View: Focus Files', group: 'View',
      shortcut: 'Ctrl+Shift+E',
      run: () => { ideLayout.setSidebarTab('files'); if (!ideLayout.layout.sidebar.visible) ideLayout.toggleSidebar() },
    })
    reg({
      id: 'view.focusHistoryTab', label: 'View: Focus History', group: 'View',
      shortcut: 'Ctrl+Shift+G',
      run: () => { ideLayout.setSidebarTab('history'); if (!ideLayout.layout.sidebar.visible) ideLayout.toggleSidebar() },
    })
    reg({
      id: 'view.focusRunsTab', label: 'View: Focus Runs', group: 'View',
      run: () => ideLayout.showBottomTab('runs'),
    })
    reg({
      id: 'view.focusChatTab', label: 'View: Focus Chat', group: 'View',
      run: () => ideLayout.showBottomTab('chat'),
    })
    reg({
      id: 'view.focusProblemsTab', label: 'View: Focus Problems', group: 'View',
      run: () => ideLayout.showBottomTab('problems'),
    })
    reg({
      id: 'view.focusOutputTab', label: 'View: Focus Output', group: 'View',
      run: () => ideLayout.showBottomTab('output'),
    })
    reg({
      id: 'view.dockToBottom', label: 'View: Dock at Bottom', group: 'View',
      shortcut: 'Ctrl+Shift+ArrowDown', runInEditable: true,
      run: () => {
        ideLayout.setDockPlacement('bottom')
        if (!ideLayout.layout.bottom.visible) ideLayout.toggleBottom()
      },
    })
    reg({
      id: 'view.dockToRight', label: 'View: Dock at Right', group: 'View',
      shortcut: 'Ctrl+Shift+ArrowRight', runInEditable: true,
      run: () => {
        ideLayout.setDockPlacement('right')
        if (!ideLayout.layout.bottom.visible) ideLayout.toggleBottom()
      },
    })
    reg({
      id: 'view.popOutDock', label: 'View: Pop Out Dock', group: 'View',
      shortcut: 'Ctrl+Shift+O', runInEditable: true,
      when: () => isElectron(),
      run: () => {
        ideLayout.setDockPlacement('popout')
        if (!ideLayout.layout.bottom.visible) ideLayout.toggleBottom()
      },
    })
    reg({
      id: 'palette.open', label: 'Open Command Palette', group: 'Palette',
      shortcut: 'Ctrl+Shift+P', runInEditable: true,
      run: () => { setPaletteMode('commands'); setPaletteOpen(true) },
    })
    reg({
      id: 'palette.openFile', label: 'Open File…', group: 'Palette',
      shortcut: 'Ctrl+P', runInEditable: true,
      run: () => { setPaletteMode('files'); setPaletteOpen(true) },
    })
    reg({
      id: 'workspace.openSettings', label: 'Open Settings', group: 'Workspace',
      shortcut: 'Ctrl+,', runInEditable: true,
      run: () => openSettingsTab(),
    })
    reg({
      id: 'workspace.changeWorkspace', label: 'Change Workspace…', group: 'Workspace',
      run: () => { changeWorkspace() },
    })
    reg({
      id: 'workspace.openRemote', label: 'Open Remote Workspace…', group: 'Workspace',
      run: () => { openRemoteWorkspace() },
    })
    reg({
      id: 'tab.close', label: 'Close Active Tab', group: 'Tabs',
      shortcut: 'Ctrl+W',
      runInEditable: true,
      when: () => workspace.activeTabKey != null,
      run: () => {
        const key = workspace.activeTabKey
        if (!key) return
        const rel = workspace.activeMarkdownRel
        void (async () => {
          if (rel && workspace.dirtySet.has(rel)) {
            const ok = await dialogs.confirm({
              title: 'Discard changes?',
              message: `Discard unsaved changes to "${rel}"?`,
              confirmLabel: 'Discard',
              danger: true,
            })
            if (!ok) return
          }
          await workspace.closeTabByKey(key)
        })()
      },
    })
    reg({
      id: 'editor.forceSave', label: 'Save Active File', group: 'Editor',
      shortcut: 'Ctrl+S',
      runInEditable: true,
      when: () => workspace.activeMarkdownRel != null,
      run: () => { void workspace.flushAll() },
    })
    reg({
      id: 'profile.switch', label: 'Switch Profile…', group: 'Workspace',
      run: () => openSwitcher(),
    })
    reg({
      id: 'editor.splitRight', label: 'Split Right', group: 'Editor',
      shortcut: 'Ctrl+\\', runInEditable: true,
      when: () => workspace.activeTabKey != null && workspace.editorGroups.length === 1,
      run: () => workspace.splitRight(),
    })
    reg({
      id: 'editor.focusGroup1', label: 'Focus Group 1', group: 'Editor',
      shortcut: 'Ctrl+1', runInEditable: true,
      when: () => workspace.editorGroups.length >= 1,
      run: () => workspace.setActiveGroupId('g1'),
    })
    reg({
      id: 'editor.focusGroup2', label: 'Focus Group 2', group: 'Editor',
      shortcut: 'Ctrl+2', runInEditable: true,
      when: () => workspace.editorGroups.length === 2,
      run: () => workspace.setActiveGroupId('g2'),
    })
    reg({
      id: 'editor.closeOtherGroup', label: 'Close Other Group', group: 'Editor',
      when: () => workspace.editorGroups.length === 2,
      run: () => {
        const other: EditorGroupId = workspace.activeGroupId === 'g1' ? 'g2' : 'g1'
        const otherGroup = workspace.editorGroups.find((g) => g.id === other)
        if (!otherGroup) return
        // Close every tab in the other group, which collapses it.
        for (const t of [...otherGroup.openTabs]) {
          const key = t.kind === 'markdown' ? t.relPath : SETTINGS_TAB_KEY
          void workspace.closeTabByKey(key, other)
        }
      },
    })
    reg({
      id: 'export.markdown',
      label: 'Export as .md',
      group: 'Workspace',
      when: () => workspace.activeMarkdownRel != null && getActiveEditor() != null,
      run: () => handleExport('md'),
    })
    reg({
      id: 'export.text',
      label: 'Export as .txt',
      group: 'Workspace',
      when: () => workspace.activeMarkdownRel != null && getActiveEditor() != null,
      run: () => handleExport('txt'),
    })

    return () => { for (const d of disposers) d() }
  }, [commands, ideLayout, workspace, changeWorkspace, openRemoteWorkspace, openSwitcher, openSettingsTab, getActiveEditor, handleExport, dialogs, setPaletteMode, setPaletteOpen])

  // ---- Document-agent commands effect ----
  // Document-agent palette commands. Registered separately so the big effect
  // above doesn't re-run (and re-fire ~30 register/dispose notifies) every
  // time handleAgentOnDocument's identity changes — that path was hitting
  // React's max-update-depth via useSyncExternalStore notifications.
  const agentRunRef = useRef(handleAgentOnDocument)
  // eslint-disable-next-line react-hooks/refs -- keep the ref in sync with the latest callback so the agent-command effect doesn't need it as a dep
  agentRunRef.current = handleAgentOnDocument
  const agentWorkspaceRef = useRef(workspace)
  // eslint-disable-next-line react-hooks/refs -- keep the ref in sync with the latest workspace so when()/run() closures see fresh state without re-registering
  agentWorkspaceRef.current = workspace

  useEffect(() => {
    const disposers: Array<() => void> = []
    const enabledDocAgents = activeProfile.actions.filter(
      (a) => a.inputMode === 'document' || a.inputMode === 'selection-or-document',
    )
    for (const agent of enabledDocAgents) {
      disposers.push(commands.register({
        id: `agent.runOnDocument.${agent.id}`,
        label: `Run "${agent.label}" on document`,
        group: 'Agent',
        when: () => agentWorkspaceRef.current.activeMarkdownRel != null,
        run: () => {
          if (agent.needsInstruction) {
            setPendingDocAgent(agent)
          } else {
            agentRunRef.current(agentWorkspaceRef.current.activeGroupId, agent)
          }
        },
      }))
    }
    return () => { for (const d of disposers) d() }
  }, [commands, activeProfile.actions, setPendingDocAgent])
}
