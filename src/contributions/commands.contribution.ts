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
 *   - 'canv:topbar:focus'  { detail?: { prefill?: '@' } }
 *   - 'canv:docAgent:pending'  { detail: { agent: AgentDef } }
 *
 * `services` is a live Proxy from Contributions.tsx that always reads the
 * latest service objects. `when`/`run` closures MUST read through `services.X`
 * — destructuring snapshots the boot-time value and goes stale on every state
 * change (this was the source of broken `when` gating on splitRight etc.).
 */
export const commands: Contribution = {
  name: 'commands',
  register(services) {
    const store = new DisposableStore()
    const cmds = services.commands

    // Resolve the active profile the same way ServicesProvider / AppInner do.
    // NOTE: snapshot at register time — `enabledDocAgents` below iterates this
    // once, so it stays in sync only as long as contributions are re-loaded
    // when activeProfile changes (see Contributions.tsx).
    const activeProfileId = services.modes.profile ?? services.modes.defaultModeId
    const activeProfile =
      services.modes.modes.find((m) => m.id === activeProfileId) ??
      services.modes.modes.find((m) => m.id === services.modes.defaultModeId)!

    const reg = (cmd: Parameters<typeof cmds.register>[0]) => {
      store.add(toDisposable(cmds.register(cmd)))
    }

    reg({
      id: 'view.toggleSidebar', label: 'View: Toggle Sidebar', group: 'View',
      shortcut: 'Ctrl+B', run: () => services.ideLayout.toggleSidebar(),
    })
    reg({
      id: 'view.toggleBottomPanel', label: 'View: Toggle Bottom Panel', group: 'View',
      shortcut: 'Ctrl+`', runInEditable: true,
      run: () => services.ideLayout.toggleBottom(),
    })
    reg({
      id: 'view.focusSearchTab', label: 'View: Focus Search', group: 'View',
      shortcut: 'Ctrl+Shift+F', runInEditable: true,
      run: () => {
        services.ideLayout.setSidebarTab('search')
        if (!services.ideLayout.layout.sidebar.visible) services.ideLayout.toggleSidebar()
      },
    })
    reg({
      id: 'view.focusFilesTab', label: 'View: Focus Files', group: 'View',
      shortcut: 'Ctrl+Shift+E',
      run: () => {
        services.ideLayout.setSidebarTab('files')
        if (!services.ideLayout.layout.sidebar.visible) services.ideLayout.toggleSidebar()
      },
    })
    reg({
      id: 'view.focusHistoryTab', label: 'View: Focus History', group: 'View',
      shortcut: 'Ctrl+Shift+G',
      run: () => {
        services.ideLayout.setSidebarTab('history')
        if (!services.ideLayout.layout.sidebar.visible) services.ideLayout.toggleSidebar()
      },
    })
    reg({
      id: 'view.focusRunsTab', label: 'View: Focus Runs', group: 'View',
      run: () => services.ideLayout.showBottomTab('runs'),
    })
    reg({
      id: 'view.focusChatTab', label: 'View: Focus Chat', group: 'View',
      run: () => services.ideLayout.showBottomTab('chat'),
    })
    reg({
      id: 'view.focusProblemsTab', label: 'View: Focus Problems', group: 'View',
      run: () => services.ideLayout.showBottomTab('problems'),
    })
    reg({
      id: 'view.focusOutputTab', label: 'View: Focus Output', group: 'View',
      run: () => services.ideLayout.showBottomTab('output'),
    })
    reg({
      id: 'view.dockToBottom', label: 'View: Dock at Bottom', group: 'View',
      shortcut: 'Ctrl+Shift+ArrowDown', runInEditable: true,
      run: () => {
        services.ideLayout.setDockPlacement('bottom')
        if (!services.ideLayout.layout.bottom.visible) services.ideLayout.toggleBottom()
      },
    })
    reg({
      id: 'view.dockToRight', label: 'View: Dock at Right', group: 'View',
      shortcut: 'Ctrl+Shift+ArrowRight', runInEditable: true,
      run: () => {
        services.ideLayout.setDockPlacement('right')
        if (!services.ideLayout.layout.bottom.visible) services.ideLayout.toggleBottom()
      },
    })
    reg({
      id: 'view.popOutDock', label: 'View: Pop Out Dock', group: 'View',
      shortcut: 'Ctrl+Shift+O', runInEditable: true,
      when: () => isElectron(),
      run: () => {
        services.ideLayout.setDockPlacement('popout')
        if (!services.ideLayout.layout.bottom.visible) services.ideLayout.toggleBottom()
      },
    })
    reg({
      id: 'palette.open', label: 'Open Command Palette', group: 'Palette',
      shortcut: 'Ctrl+Shift+P', runInEditable: true,
      run: () => {
        window.dispatchEvent(new CustomEvent('canv:topbar:focus'))
      },
    })
    reg({
      id: 'palette.openFile', label: 'Open File…', group: 'Palette',
      shortcut: 'Ctrl+P', runInEditable: true,
      run: () => {
        window.dispatchEvent(new CustomEvent('canv:topbar:focus', { detail: { prefill: '@' } }))
      },
    })
    reg({
      id: 'workspace.openSettings', label: 'Open Settings', group: 'Workspace',
      shortcut: 'Ctrl+,', runInEditable: true,
      run: () => services.workspace.openSettingsTab(),
    })
    reg({
      id: 'workspace.changeWorkspace', label: 'Change Workspace…', group: 'Workspace',
      run: () => { void services.workspaceFileOps.changeWorkspace() },
    })
    reg({
      id: 'workspace.openRemote', label: 'Open Remote Workspace…', group: 'Workspace',
      run: () => { void services.workspaceFileOps.openRemoteWorkspace() },
    })
    reg({
      id: 'tab.close', label: 'Close Active Tab', group: 'Tabs',
      shortcut: 'Ctrl+W',
      runInEditable: true,
      when: () => services.workspace.activeTabKey != null,
      run: () => {
        const ws = services.workspace
        const key = ws.activeTabKey
        if (!key) return
        const rel = ws.activeMarkdownRel
        void (async () => {
          if (rel && ws.dirtySet.has(rel)) {
            const ok = await services.dialogs.confirm({
              title: 'Discard changes?',
              message: `Discard unsaved changes to "${rel}"?`,
              confirmLabel: 'Discard',
              danger: true,
            })
            if (!ok) return
          }
          await ws.closeTabByKey(key)
        })()
      },
    })
    reg({
      id: 'editor.forceSave', label: 'Save Active File', group: 'Editor',
      shortcut: 'Ctrl+S',
      runInEditable: true,
      when: () => services.workspace.activeMarkdownRel != null,
      run: () => { void services.workspace.flushAll() },
    })
    reg({
      id: 'profile.switch', label: 'Switch Profile…', group: 'Workspace',
      run: () => services.profilePicker.openSwitcher(),
    })
    reg({
      id: 'editor.splitRight', label: 'Split Right', group: 'Editor',
      shortcut: 'Ctrl+\\', runInEditable: true,
      when: () => services.workspace.activeTabKey != null && services.workspace.editorGroups.length === 1,
      run: () => services.workspace.splitRight(),
    })
    reg({
      id: 'editor.focusGroup1', label: 'Focus Group 1', group: 'Editor',
      shortcut: 'Ctrl+1', runInEditable: true,
      when: () => services.workspace.editorGroups.length >= 1,
      run: () => services.workspace.setActiveGroupId('g1'),
    })
    reg({
      id: 'editor.focusGroup2', label: 'Focus Group 2', group: 'Editor',
      shortcut: 'Ctrl+2', runInEditable: true,
      when: () => services.workspace.editorGroups.length === 2,
      run: () => services.workspace.setActiveGroupId('g2'),
    })
    reg({
      id: 'editor.closeOtherGroup', label: 'Close Other Group', group: 'Editor',
      when: () => services.workspace.editorGroups.length === 2,
      run: () => {
        const ws = services.workspace
        const other: EditorGroupId = ws.activeGroupId === 'g1' ? 'g2' : 'g1'
        const otherGroup = ws.editorGroups.find((g) => g.id === other)
        if (!otherGroup) return
        for (const t of [...otherGroup.openTabs]) {
          const key = t.kind === 'markdown' ? t.relPath : SETTINGS_TAB_KEY
          void ws.closeTabByKey(key, other)
        }
      },
    })

    // ---- Export commands ----
    const handleExport = (fmt: 'txt' | 'md') => {
      const view = services.editorRegistry.getActiveEditor()
      const rel = services.workspace.activeMarkdownRel
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
      when: () => services.workspace.activeMarkdownRel != null && services.editorRegistry.getActiveEditor() != null,
      run: () => handleExport('md'),
    })
    reg({
      id: 'export.text',
      label: 'Export as .txt',
      group: 'Workspace',
      when: () => services.workspace.activeMarkdownRel != null && services.editorRegistry.getActiveEditor() != null,
      run: () => handleExport('txt'),
    })

    // ---- Document-agent commands ----
    const enabledDocAgents = activeProfile.actions.filter(
      (a) => a.inputMode === 'document' || a.inputMode === 'selection-or-document',
    )
    for (const agent of enabledDocAgents) {
      reg({
        id: `agent.runOnDocument.${agent.id}`,
        label: `Run "${agent.label}" on document`,
        group: 'Agent',
        when: () => services.workspace.activeMarkdownRel != null,
        run: () => {
          if (agent.needsInstruction) {
            window.dispatchEvent(new CustomEvent<{ agent: AgentDef }>('canv:docAgent:pending', { detail: { agent } }))
          } else {
            services.selectionAgent.handleAgentOnDocument(services.workspace.activeGroupId, agent)
          }
        },
      })
    }

    return store
  },
}

registerContribution(commands)
