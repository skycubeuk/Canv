'use strict'

/**
 * history IPC handlers. Called once at app.whenReady from electron/main.cjs.
 *
 * The history service singleton (`HISTORY`) and its lazy-init function
 * (`getHistoryService`) live in main.cjs because they are reset on workspace
 * close from cross-domain code paths. We access them via `deps.getHistoryService()`.
 *
 * Revision Archaeology is local-only and backed by isomorphic-git on a
 * dedicated `canv-history` branch. See electron/history-service.cjs.
 */
function registerIpcHandlers(ipcMain, deps) {
  const { getHistoryService } = deps

  ipcMain.handle('canvHistory:init', async () => getHistoryService().initRevisionArchaeology())
  ipcMain.handle('canvHistory:createSnapshot', async (_e, input) => getHistoryService().createSnapshot(input))
  ipcMain.handle('canvHistory:listSnapshots', async (_e, opts) => getHistoryService().listSnapshots(opts))
  ipcMain.handle('canvHistory:getSnapshot', async (_e, id) => getHistoryService().getSnapshot(id))
  ipcMain.handle('canvHistory:getSnapshotByCommit', async (_e, sha) => getHistoryService().getSnapshotByCommit(sha))
  ipcMain.handle('canvHistory:diffSnapshot', async (_e, id, rel) => getHistoryService().diffSnapshot(id, rel))
  ipcMain.handle('canvHistory:diffCurrent', async (_e, rel) => getHistoryService().diffCurrent(rel))
  ipcMain.handle('canvHistory:getCurrentChanges', async () => getHistoryService().getCurrentChanges())
  ipcMain.handle('canvHistory:restoreFilePreview', async (_e, id, rel) => getHistoryService().restoreFilePreview(id, rel))
  ipcMain.handle('canvHistory:restoreFile', async (_e, id, rel) => getHistoryService().restoreFile(id, rel))
  ipcMain.handle('canvHistory:hideSnapshot', async (_e, id) => getHistoryService().hideSnapshot(id))
  ipcMain.handle('canvHistory:patchSnapshotFiles', async (_e, id, files) =>
    getHistoryService().patchSnapshotFiles(id, files))
  ipcMain.handle('canvHistory:getTipCommit', async () => getHistoryService().getTipCommit())
  ipcMain.handle('canvHistory:getSnapshotDelta', async (_e, id) => getHistoryService().getSnapshotDelta(id))
  ipcMain.handle('canvHistory:getFileHistory', async (_e, rel) => getHistoryService().getFileHistory(rel))
}

module.exports = { registerIpcHandlers }
