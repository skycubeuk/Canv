import { ExtensionPromptModal } from '../extensions/ExtensionPromptModal'
import { ProfilePicker } from '../ProfilePicker'
import { MigrationModal } from '../MigrationModal'
import { CommandPalette, type PaletteMode } from './CommandPalette'
import OpenRemoteDialog from '../dialogs/OpenRemoteDialog'
import { DocumentAgentInstructionModal } from '../DocumentAgentInstructionModal'
import { WorkspaceSetupModal } from '../WorkspaceSetupModal'
import { RestorePreviewDialog } from './sidebar/RestorePreviewDialog'
import { getCanvHistory } from '../../lib/history'
import { getFs } from '../../lib/fs'
import type { Action as AgentDef } from '../../config/types'
import { editorMapKey } from '../../hooks/useEditorRegistry'
import { useService } from '../../services/useService'
import { usePaletteContent } from '../../hooks/usePaletteContent'

export interface AppOverlaysProps {
  // Migration (App-local UI state)
  migrationOpen: boolean
  onMigrationComplete: () => void
  // Document-agent instruction (App-local UI state)
  pendingDocAgent: AgentDef | null
  onSubmitDocAgent: (instruction: string) => void
  onCancelDocAgent: () => void
  // Palette (App-local UI state)
  paletteOpen: boolean
  paletteMode: PaletteMode
  onClosePalette: () => void
  // File-history restore — App-local UI state, set via dock-bridge events
  // or the HistoryTab's onRestore prop; cleared when the dialog closes.
  restoreTarget: { snapshotId: string; relPath: string } | null
  onCloseRestore: () => void
}

export function AppOverlays(props: AppOverlaysProps) {
  const {
    migrationOpen, onMigrationComplete,
    pendingDocAgent, onSubmitDocAgent, onCancelDocAgent,
    paletteOpen, paletteMode, onClosePalette,
    restoreTarget, onCloseRestore,
  } = props
  const { paletteFiles, paletteRecents } = usePaletteContent()

  const profilePicker = useService('profilePicker')
  const workspace = useService('workspace')
  const editorRegistry = useService('editorRegistry')
  const fileOps = useService('workspaceFileOps')
  const notifications = useService('notifications')
  const chatSessions = useService('chatSessions')
  const commands = useService('commands')
  const contributions = useService('contributions')
  const setup = useService('setup')
  const modesSvc = useService('modes')
  const { showToast } = notifications

  const editorsRef = editorRegistry.editorsRef

  return (
    <>
      <ProfilePicker
        open={profilePicker.open}
        mode={profilePicker.mode === 'first-launch' ? 'first-launch' : 'new'}
        onPick={profilePicker.pickProfile}
        onCancel={profilePicker.mode === 'switch' ? profilePicker.cancel : undefined}
      />

      {workspace.conflict && (
        <ConflictDialog
          rel={workspace.conflict.relPath}
          onReload={async () => {
            await workspace.reloadTabFromDisk(workspace.conflict!.relPath)
            workspace.resolveConflict()
          }}
          onOverwrite={() => {
            const rel = workspace.conflict!.relPath
            const view = editorsRef.current.get(editorMapKey(workspace.activeGroupId, rel))
            if (view) workspace.saveTab(rel, view.state.doc.toString())
            workspace.resolveConflict()
          }}
          onDismiss={workspace.resolveConflict}
        />
      )}

      {migrationOpen && (
        <MigrationModal onComplete={onMigrationComplete} />
      )}

      <OpenRemoteDialog
        open={fileOps.remoteDialogOpen}
        recent={fileOps.recentRemotes}
        onClose={fileOps.closeRemoteDialog}
        onConnect={fileOps.connectRemote}
      />

      {pendingDocAgent && (
        <DocumentAgentInstructionModal
          agent={pendingDocAgent}
          canRun={workspace.activeMarkdownRel != null}
          onSubmit={onSubmitDocAgent}
          onCancel={onCancelDocAgent}
        />
      )}

      {notifications.toast && (
        <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-[rgb(var(--text-default))] text-[rgb(var(--bg-app))] text-sm rounded-md shadow-lg">
          {notifications.toast}
        </div>
      )}

      {notifications.retryUndo && (
        <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-[rgb(var(--text-default))] text-[rgb(var(--bg-app))] text-sm rounded-md shadow-lg flex items-center gap-3">
          <span>Discarded {notifications.retryUndo.count} turn{notifications.retryUndo.count === 1 ? '' : 's'}</span>
          <button
            type="button"
            className="underline font-medium"
            onClick={() => chatSessions.undoRetry()}
          >
            Undo
          </button>
        </div>
      )}

      <CommandPalette
        open={paletteOpen}
        mode={paletteMode}
        commands={commands.list()}
        files={paletteFiles}
        recentFiles={paletteRecents}
        onClose={onClosePalette}
        onRunCommand={(id) => { commands.runById(id) }}
        onOpenFile={(rel) => { void workspace.openTab(rel) }}
        extensionCommands={contributions.commands}
        onInvokeExtensionCommand={(id) => { void window.canvExtensions?.invokeCommand?.(id) }}
      />

      {restoreTarget && getCanvHistory() && (
        <RestorePreviewDialog
          history={getCanvHistory()!}
          snapshotId={restoreTarget.snapshotId}
          relPath={restoreTarget.relPath}
          onCancel={onCloseRestore}
          onRestored={async (rollbackId, mtimeMs) => {
            const rel = restoreTarget.relPath
            // Suppress the conflict popup for our own write — must run before the
            // chokidar 'change' event echoes back from the disk watcher.
            workspace.noteOwnDiskWrite(rel, mtimeMs)
            onCloseRestore()
            showToast(`Restored ${rel}. Safety snapshot: ${rollbackId}`)
            try { await workspace.reloadTabFromDisk(rel) } catch { /* tab may not be open */ }
          }}
          saveDirtyBuffer={async () => { await workspace.flushAll() }}
        />
      )}

      {setup.phase === 'needs-setup' && (
        <WorkspaceSetupModal
          modes={modesSvc.modes.map((m) => ({ id: m.id, label: m.label }))}
          defaultProfile={modesSvc.defaultModeId ?? modesSvc.modes[0]?.id ?? 'fiction'}
          remote={workspace.kind?.kind === 'remote' ? true : false}
          onConfirm={async (r) => {
            try { await setup.confirm(r) } catch (e) { showToast(`Setup failed: ${(e as Error).message}`) }
          }}
          onCancel={async () => {
            setup.cancel()
            try { await getFs().closeWorkspace() } catch { /* ignore */ }
          }}
        />
      )}

      <ExtensionPromptModal />
    </>
  )
}

function ConflictDialog({
  rel,
  onReload,
  onOverwrite,
  onDismiss,
}: {
  rel: string
  onReload: () => void
  onOverwrite: () => void
  onDismiss: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-w-sm w-full bg-elev rounded-lg shadow-xl p-5 space-y-3">
        <h3 className="text-base font-semibold">File changed on disk</h3>
        <p className="text-sm text-muted">
          "{rel}" was modified outside Canv. Choose what to keep.
        </p>
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" className="btn-ghost" onClick={onDismiss}>Dismiss</button>
          <button type="button" className="btn-secondary" onClick={onOverwrite}>Keep my edits</button>
          <button type="button" className="btn-primary" onClick={onReload}>Reload from disk</button>
        </div>
      </div>
    </div>
  )
}
