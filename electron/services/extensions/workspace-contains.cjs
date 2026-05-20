'use strict'

const path = require('node:path')
const fsp = require('node:fs/promises')
const picomatch = require('picomatch')

/**
 * Workspace-contains activation evaluator.
 *
 * Watches two sources of file-presence signals:
 *   1. evaluateAtOpen() — walks the vault once on workspace open / registry
 *      change, firing for any extension whose declared workspaceContains:<glob>
 *      matches a file that's already there.
 *   2. chokidar 'add' events — fires when a matching file appears later.
 *
 * Asymmetric (per spec): once activated, the extension stays alive until
 * disable/uninstall — there is no deactivate hook.
 */
function createWorkspaceContainsEvaluator({ getWorkspace, getInstalled, runtime, watcher }) {
  const compiledGlobsByExt = new Map()

  function rebuild() {
    compiledGlobsByExt.clear()
    for (const ext of getInstalled()) {
      const events = (ext.manifest && ext.manifest.activationEvents) || []
      const globs = events
        .filter((e) => typeof e === 'string' && e.startsWith('workspaceContains:'))
        .map((e) => e.slice('workspaceContains:'.length))
      if (globs.length > 0) {
        compiledGlobsByExt.set(ext.id, {
          matchers: globs.map((g) => picomatch(g, { dot: true })),
          rawGlobs: globs,
        })
      }
    }
  }

  function fireIfMatched(relPath) {
    if (typeof relPath !== 'string' || relPath.length === 0) return
    for (const [extId, entry] of compiledGlobsByExt) {
      if (runtime.manifestFor && runtime.manifestFor(extId)) continue   // already active
      if (entry.matchers.some((m) => m(relPath))) {
        try {
          runtime.activate(extId, { kind: 'workspaceContains', glob: entry.rawGlobs[0] })
        } catch (e) {
          console.error(`[workspaceContains] activate ${extId} failed:`, e)
        }
      }
    }
  }

  async function* walk(root, rel = '') {
    let entries
    try { entries = await fsp.readdir(path.join(root, rel), { withFileTypes: true }) }
    catch { return }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue   // skip hidden (.git, .canv, etc.)
      const childRel = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        yield* walk(root, childRel)
      } else if (e.isFile()) {
        yield childRel
      }
    }
  }

  async function evaluateAtOpen() {
    const ws = getWorkspace()
    if (!ws || !ws.root) return
    for await (const rel of walk(ws.root)) {
      fireIfMatched(rel)
    }
  }

  const onAdd = (relPath) => fireIfMatched(relPath)
  watcher.on('add', onAdd)

  return {
    rebuild,
    evaluateAtOpen,
    dispose() { watcher.off('add', onAdd) },
  }
}

module.exports = { createWorkspaceContainsEvaluator }
