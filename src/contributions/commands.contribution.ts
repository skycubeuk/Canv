import { DisposableStore, toDisposable } from '../lib/lifecycle'
import { isElectron } from '../lib/fs'
import { SETTINGS_TAB_KEY } from '../lib/tabKey'
import type { Action as AgentDef } from '../config/types'
import type { EditorGroupId } from '../types/workspace'
import { registerContribution, type Contribution } from './index'

/**
 * Replaces useAppCommands. Registers every built-in command into
 * `services.commands` and the per-agent "Run on document" commands derived
 * from the active profile.
 *
 * Two pieces of state that previously lived in App.tsx via React useState —
 * the command palette open/mode flags and `pendingDocAgent` — remain in
 * AppInner; this contribution drives them via DOM CustomEvents (App listens
 * and updates state). That keeps the migration narrow: no service-shape
 * changes, no cascading consumer rewrites.
 *
 * Events (all dispatched on `window`):
 *   - 'canv:palette:open'  { detail: { mode: 'commands' | 'files' } }
 *   - 'canv:docAgent:pending'  { detail: { agent: AgentDef } }
 *
 * The contribution is re-registered whenever the services identity changes
 * (e.g. activeProfile.actions changes), which re-derives the doc-agent
 * commands. The keyboard registry tolerates re-registration as a replace.
 */
export const commands: Contribution = {
  name: 'commands',
  register(services) {
    const store = new DisposableStore()
    const cmds = services.commands
    const { ideLayout, workspace, dialogs, modes, workspaceFileOps, profilePicker, editorRegistry, selectionAgent } = services

    // Resolve the active profile the same way ServicesProvider / AppInner do.
    const activeProfileId = modes.profile ?? modes.defaultModeId
    const activeProfile =
      modes.modes.find((m) => m.id === activeProfileId) ??
      modes.modes.find((m) => m.id === modes.defaultModeId)!

    const reg = (cmd: Parameters<typeof cmds.register>[0]) => {
      store.add(toDisposable(cmds.register(cmd)))
    }

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
      run: () => {
        window.dispatchEvent(new CustomEvent('canv:palette:open', { detail: { mode: 'commands' } }))
      },
    })
    reg({
      id: 'palette.openFile', label: 'Open File…', group: 'Palette',
      shortcut: 'Ctrl+P', runInEditable: true,
      run: () => {
        window.dispatchEvent(new CustomEvent('canv:palette:open', { detail: { mode: 'files' } }))
      },
    })
    reg({
      id: 'workspace.openSettings', label: 'Open Settings', group: 'Workspace',
      shortcut: 'Ctrl+,', runInEditable: true,
      run: () => workspace.openSettingsTab(),
    })
    reg({
      id: 'workspace.changeWorkspace', label: 'Change Workspace…', group: 'Workspace',
      run: () => { void workspaceFileOps.changeWorkspace() },
    })
    reg({
      id: 'workspace.openRemote', label: 'Open Remote Workspace…', group: 'Workspace',
      run: () => { void workspaceFileOps.openRemoteWorkspace() },
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
      run: () => profilePicker.openSwitcher(),
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

    // ---- Export commands ----
    // Original handleExport lived in App.tsx; its logic is small and only
    // touches services (editorRegistry + workspace), so inline it here.
    const handleExport = (fmt: 'txt' | 'md') => {
      const view = editorRegistry.getActiveEditor()
      const rel = workspace.activeMarkdownRel
      if (!view || !rel) return
      const text = view.state.doc.toString()
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const i = rel.lastIndexOf('/')
      const base = i >= 0 ? rel.slice(i + 1) : rel
      const name = base.replace(/\.(md|markdown)$/i, '')
      a.href = url
      a.download = `${name || 'document'}.${fmt}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }

    reg({
      id: 'export.markdown',
      label: 'Export as .md',
      group: 'Workspace',
      when: () => workspace.activeMarkdownRel != null && editorRegistry.getActiveEditor() != null,
      run: () => handleExport('md'),
    })
    reg({
      id: 'export.text',
      label: 'Export as .txt',
      group: 'Workspace',
      when: () => workspace.activeMarkdownRel != null && editorRegistry.getActiveEditor() != null,
      run: () => handleExport('txt'),
    })

    // ---- Document-agent commands ----
    // One command per agent that consumes the whole document. Agents that
    // need an instruction surface the doc-agent input via the
    // 'canv:docAgent:pending' event; AppOverlays renders the modal.
    const enabledDocAgents = activeProfile.actions.filter(
      (a) => a.inputMode === 'document' || a.inputMode === 'selection-or-document',
    )
    for (const agent of enabledDocAgents) {
      reg({
        id: `agent.runOnDocument.${agent.id}`,
        label: `Run "${agent.label}" on document`,
        group: 'Agent',
        when: () => workspace.activeMarkdownRel != null,
        run: () => {
          if (agent.needsInstruction) {
            window.dispatchEvent(new CustomEvent<{ agent: AgentDef }>('canv:docAgent:pending', { detail: { agent } }))
          } else {
            selectionAgent.handleAgentOnDocument(workspace.activeGroupId, agent)
          }
        },
      })
    }

    return store
  },
}

registerContribution(commands)
