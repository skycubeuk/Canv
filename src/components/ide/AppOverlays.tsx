import { ExtensionPromptModal } from '../extensions/ExtensionPromptModal'
import { ProfilePicker } from '../ProfilePicker'
import { MigrationModal } from '../MigrationModal'
import { CommandPalette, type PaletteMode, type PaletteFile } from './CommandPalette'
import OpenRemoteDialog from '../dialogs/OpenRemoteDialog'
import { DocumentAgentInstructionModal } from '../DocumentAgentInstructionModal'
import type { Action as AgentDef } from '../../config/types'
import type { useWorkspace } from '../../hooks/useWorkspace'
import type { useProfilePicker } from '../../hooks/useProfilePicker'
import type { useWorkspaceFileOps } from '../../hooks/useWorkspaceFileOps'
import type { useNotifications } from '../../hooks/useNotifications'
import type { useCommands } from '../../hooks/useCommands'
import { editorMapKey } from '../../hooks/useEditorRegistry'
import type { EditorView } from '@codemirror/view'
import type React from 'react'

type WorkspaceApi = ReturnType<typeof useWorkspace>
type ProfilePickerApi = ReturnType<typeof useProfilePicker>
type FileOpsApi = ReturnType<typeof useWorkspaceFileOps>
type NotificationsApi = ReturnType<typeof useNotifications>
type CommandsApi = ReturnType<typeof useCommands>

export interface AppOverlaysProps {
  // Profile picker
  profilePicker: ProfilePickerApi
  // Migration
  migrationOpen: boolean
  onMigrationComplete: () => void
  // Workspace conflict
  workspace: WorkspaceApi
  editorsRef: React.MutableRefObject<Map<string, EditorView>>
  // Remote workspace dialog (file ops)
  fileOps: FileOpsApi
  // Document-agent instruction
  pendingDocAgent: AgentDef | null
  onSubmitDocAgent: (instruction: string) => void
  onCancelDocAgent: () => void
  // Notifications + retry undo
  notifications: NotificationsApi
  onUndoRetry: () => void
  // Palette
  paletteOpen: boolean
  paletteMode: PaletteMode
  paletteFiles: PaletteFile[]
  paletteRecents: PaletteFile[]
  onClosePalette: () => void
  commands: CommandsApi
  onOpenFile: (rel: string) => void
}

export function AppOverlays(props: AppOverlaysProps) {
  const {
    profilePicker, migrationOpen, onMigrationComplete,
    workspace, editorsRef,
    fileOps, pendingDocAgent, onSubmitDocAgent, onCancelDocAgent,
    notifications, onUndoRetry,
    paletteOpen, paletteMode, paletteFiles, paletteRecents, onClosePalette,
    commands, onOpenFile,
  } = props

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
            onClick={onUndoRetry}
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
        onOpenFile={onOpenFile}
      />

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
