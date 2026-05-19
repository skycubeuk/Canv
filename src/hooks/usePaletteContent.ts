import { useEffect, useMemo, useState } from 'react'
import { useService } from '../services/useService'
import { flattenTree } from '../lib/fs'
import type { PaletteFile } from '../components/ide/CommandPalette'

/**
 * Computes the file lists rendered by the CommandPalette:
 *
 *   - paletteFiles:   every markdown file in the workspace tree
 *   - paletteRecents: the last 30 markdown files opened in this session
 *
 * `recentFiles` lives here (not in services) because it's purely UI-derived
 * scratch state — nothing outside the palette cares about the ordering.
 * It tracks `workspace.activeMarkdownRel` and never persists across reloads.
 */
export function usePaletteContent(): {
  paletteFiles: PaletteFile[]
  paletteRecents: PaletteFile[]
} {
  const workspace = useService('workspace')
  const [recentFiles, setRecentFiles] = useState<string[]>([])

  useEffect(() => {
    const rel = workspace.activeMarkdownRel
    if (!rel) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- functional updater; runs only when activeMarkdownRel changes, no cascade risk
    setRecentFiles((prev) => {
      if (prev[0] === rel) return prev
      const next = [rel, ...prev.filter((r) => r !== rel)]
      return next.slice(0, 30)
    })
  }, [workspace.activeMarkdownRel])

  const paletteFiles = useMemo<PaletteFile[]>(() => {
    if (!workspace.tree) return []
    const out: PaletteFile[] = []
    for (const entry of flattenTree(workspace.tree)) {
      if (entry.kind === 'file' && /\.(md|markdown)$/i.test(entry.relPath)) {
        out.push({ rel: entry.relPath, basename: entry.name })
      }
    }
    return out
  }, [workspace.tree])

  const paletteRecents = useMemo<PaletteFile[]>(() => {
    return recentFiles.map((rel) => {
      const i = rel.lastIndexOf('/')
      return { rel, basename: i >= 0 ? rel.slice(i + 1) : rel }
    })
  }, [recentFiles])

  return { paletteFiles, paletteRecents }
}
