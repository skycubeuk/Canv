'use strict'

const path = require('node:path')
const fs = require('node:fs')

const ANNOTATIONS_DIR = path.join('.canv', 'annotations')

/**
 * annotation-persistence IPC handlers. Called once at app.whenReady from
 * electron/main.cjs.
 *
 * Sidecar files live at <workspaceRoot>/.canv/annotations/<rel>.json where
 * <rel> is the workspace-relative path of the markdown file, e.g.
 *   "notes/todo.md" -> ".canv/annotations/notes/todo.md.json"
 *
 * AnnotationRecord (persisted; the ANCHOR is stored, not raw offsets):
 *   { id, anchor: { quote, prefix, suffix }, note, author, suggestedReplacement? }
 *
 * Path traversal is rejected via deps.safeResolve (the same validator the FS
 * bridge uses). The workspace root comes from deps.requireWorkspace.
 */
function registerIpcHandlers(ipcMain, deps) {
  // Resolve the absolute sidecar path for `rel`, validating against traversal.
  // Throws if `rel` is unsafe or no workspace is open.
  function sidecarPath(rel) {
    const root = deps.requireWorkspace()
    // Validate the caller's rel first (rejects '..', absolute paths, NUL, etc.)
    deps.safeResolve(root, rel)
    // Build the sidecar path under .canv/annotations and re-validate the whole
    // thing so the final write target is provably inside the workspace.
    const annotRel = path.join(ANNOTATIONS_DIR, rel + '.json')
    return deps.safeResolve(root, annotRel)
  }

  ipcMain.handle('canvAnnotations:load', (_e, rel) => {
    if (typeof rel !== 'string' || !rel) return []
    let absPath
    try {
      absPath = sidecarPath(rel)
    } catch {
      return []
    }
    if (!fs.existsSync(absPath)) return []
    try {
      const parsed = JSON.parse(fs.readFileSync(absPath, 'utf8'))
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })

  ipcMain.handle('canvAnnotations:save', (_e, rel, records) => {
    if (typeof rel !== 'string' || !rel) return
    let absPath
    try {
      absPath = sidecarPath(rel)
    } catch {
      return
    }
    // No annotations left -> delete the sidecar to keep .canv tidy.
    if (!Array.isArray(records) || records.length === 0) {
      try {
        if (fs.existsSync(absPath)) fs.unlinkSync(absPath)
      } catch { /* best-effort delete */ }
      return
    }
    // Atomic write: .tmp then rename (mirrors site-registry.cjs).
    try {
      fs.mkdirSync(path.dirname(absPath), { recursive: true })
      const tmp = absPath + '.tmp'
      fs.writeFileSync(tmp, JSON.stringify(records, null, 2), 'utf8')
      fs.renameSync(tmp, absPath)
    } catch (err) {
      console.error('[canvAnnotations:save] write failed:', err)
    }
  })
}

module.exports = { registerIpcHandlers }
