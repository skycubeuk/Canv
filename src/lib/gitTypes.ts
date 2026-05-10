/** Status of a single file in the working tree, as returned by isomorphic-git. */
export type GitFileStatus =
  | 'modified'    // tracked, working-tree differs from HEAD
  | 'deleted'     // tracked, removed from working tree
  | 'renamed'     // tracked rename (isomorphic-git approximation via add+delete pair)
  | 'added'       // new file, staged (index present, no HEAD entry)
  | 'untracked'   // not tracked at all

export interface GitStatusEntry {
  relPath: string
  status: GitFileStatus
}

/**
 * Payload returned by `canvFS:gitStatus`.
 * `branch` is null when the repo is in detached HEAD state.
 * All arrays are sorted by relPath.
 */
export interface GitStatusPayload {
  branch: string | null
  changed: GitStatusEntry[]   // modified | deleted | renamed — working-tree vs HEAD
  staged: GitStatusEntry[]    // added — index has entry but HEAD does not
  untracked: GitStatusEntry[] // not tracked by git
}

/**
 * Payload returned by `canvFS:gitDiff`.
 * Both strings are raw markdown source (UTF-8).
 * `baseText` is the blob from `baseRef` (empty string if the file is new or ref missing).
 * `currentText` is the current working-tree content (empty string if the file was deleted).
 */
export interface GitDiffPayload {
  relPath: string
  baseRef: string
  baseText: string
  currentText: string
}
