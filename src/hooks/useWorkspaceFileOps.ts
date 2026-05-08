import { useCallback, useMemo, useState } from 'react'
import type { useWorkspace } from './useWorkspace'
import type { useDialogs } from '../lib/dialogs'
import { getFs, type RecentRemote } from '../lib/fs'

type WorkspaceApi = ReturnType<typeof useWorkspace>
type DialogsApi = ReturnType<typeof useDialogs>

export interface UseWorkspaceFileOpsArgs {
  workspace: WorkspaceApi
  dialogs: DialogsApi
  showToast: (msg: string) => void
}

export interface UseWorkspaceFileOpsApi {
  remoteDialogOpen: boolean
  closeRemoteDialog: () => void
  recentRemotes: RecentRemote[]
  changeWorkspace: () => Promise<void>
  openRemoteWorkspace: () => Promise<void>
  connectRemote: (raw: string) => Promise<void>
  createFile: (parentRel: string) => Promise<void>
  createFolder: (parentRel: string) => Promise<void>
  rename: (oldRel: string, newRel: string) => Promise<void>
  remove: (rel: string) => Promise<void>
}

export function useWorkspaceFileOps(args: UseWorkspaceFileOpsArgs): UseWorkspaceFileOpsApi {
  const { workspace, dialogs, showToast } = args

  const [remoteDialogOpen, setRemoteDialogOpen] = useState(false)
  const [recentRemotes, setRecentRemotes] = useState<RecentRemote[]>([])

  const changeWorkspace = useCallback(async () => {
    await workspace.flushAll()
    const ok = await workspace.pickWorkspace()
    if (!ok) return
  }, [workspace])

  const openRemoteWorkspace = useCallback(async () => {
    await workspace.flushAll()
    try {
      const list = await getFs().listRecentRemotes()
      setRecentRemotes(list)
    } catch {
      setRecentRemotes([])
    }
    setRemoteDialogOpen(true)
  }, [workspace])

  const closeRemoteDialog = useCallback(() => {
    setRemoteDialogOpen(false)
  }, [])

  const connectRemote = useCallback(async (raw: string) => {
    await workspace.openRemote(raw)
  }, [workspace])

  const createFile = useCallback(async (parentRel: string) => {
    const name = await dialogs.prompt({
      title: 'New file',
      message: parentRel ? `In folder ${parentRel}` : undefined,
      initialValue: 'untitled.md',
      placeholder: 'name.md',
      submitLabel: 'Create',
      validate: (v) => {
        const trimmed = v.trim()
        if (!trimmed) return 'Name cannot be empty'
        if (!/\.(md|markdown)$/i.test(trimmed)) return 'Must end in .md or .markdown'
        return null
      },
    })
    if (!name) return
    const trimmed = name.trim()
    const rel = parentRel ? `${parentRel}/${trimmed}` : trimmed
    try {
      await workspace.createFile(rel, '')
      await workspace.openTab(rel)
    } catch (e) {
      showToast(`Could not create file: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [workspace, showToast, dialogs])

  const createFolder = useCallback(async (parentRel: string) => {
    const name = await dialogs.prompt({
      title: 'New folder',
      message: parentRel ? `In folder ${parentRel}` : undefined,
      initialValue: 'folder',
      placeholder: 'folder name',
      submitLabel: 'Create',
      validate: (v) => (v.trim() ? null : 'Name cannot be empty'),
    })
    if (!name) return
    const trimmed = name.trim()
    const rel = parentRel ? `${parentRel}/${trimmed}` : trimmed
    try {
      await workspace.createFolder(rel)
    } catch (e) {
      showToast(`Could not create folder: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [workspace, showToast, dialogs])

  const rename = useCallback(async (oldRel: string, newRel: string) => {
    try {
      await workspace.rename(oldRel, newRel)
    } catch (e) {
      showToast(`Could not rename: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [workspace, showToast])

  const remove = useCallback(async (rel: string) => {
    try {
      await workspace.remove(rel)
    } catch (e) {
      showToast(`Could not delete: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [workspace, showToast])

  return useMemo<UseWorkspaceFileOpsApi>(() => ({
    remoteDialogOpen, closeRemoteDialog, recentRemotes,
    changeWorkspace, openRemoteWorkspace, connectRemote,
    createFile, createFolder, rename, remove,
  }), [
    remoteDialogOpen, closeRemoteDialog, recentRemotes,
    changeWorkspace, openRemoteWorkspace, connectRemote,
    createFile, createFolder, rename, remove,
  ])
}
