import { BookOpen, PencilLine, Sparkles } from 'lucide-react'
import type { Action, Mode } from '../config/types'

const baseAction: Action = {
  id: 'grammar',
  label: 'Grammar',
  icon: PencilLine,
  group: 'core',
  inputMode: 'selection-or-document',
  outputMode: 'feedback-and-rewrite',
  needsInstruction: false,
  prompt: 'Edit this:\n{{text}}',
}

export function makeTestAction(overrides: Partial<Action> = {}): Action {
  return { ...baseAction, ...overrides }
}

export function makeTestMode(overrides: Partial<Mode> = {}): Mode {
  return {
    id: 'test',
    label: 'Test',
    icon: BookOpen,
    description: 'A test mode.',
    examples: 'Tests',
    order: 1,
    default: true,
    chatSystemPrompt: 'You are a test.',
    actions: [
      makeTestAction(),
      makeTestAction({
        id: 'refine',
        label: 'Refine',
        icon: Sparkles,
        inputMode: 'selection',
        outputMode: 'replacement',
        needsInstruction: true,
        instructionPlaceholder: 'What should change?',
        prompt: '{{instruction}}\n{{text}}',
      }),
    ],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Handler-test helpers
// ---------------------------------------------------------------------------

import type { CanvFs, DirNode, DirFile, ReadResult, WriteResult } from '../lib/fs'
import type { SearchQuery, SearchResult } from '../lib/searchTypes'
import type { ToolCtx } from '../tools/types'

export interface MockFile {
  content: string
  mtimeMs: number
  size: number
  binary: boolean
}

/** Builds a minimal in-memory CanvFs for handler tests. Files are stored by relPath. */
export function makeMockFs(initial: Record<string, MockFile>): CanvFs {
  const files = new Map<string, MockFile>(Object.entries(initial))
  const folders = new Set<string>()
  for (const rel of files.keys()) {
    const parts = rel.split('/')
    for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join('/'))
  }

  function listAt(rel: string): DirNode {
    const childFiles: DirFile[] = []
    const childFolders: DirNode[] = []
    const prefix = rel === '' ? '' : rel + '/'
    const seenSub = new Set<string>()
    for (const [path, f] of files.entries()) {
      if (!path.startsWith(prefix)) continue
      const remainder = path.slice(prefix.length)
      const slash = remainder.indexOf('/')
      if (slash === -1) {
        childFiles.push({
          name: remainder, relPath: path, kind: 'file',
          mtimeMs: f.mtimeMs, size: f.size, binary: f.binary,
        })
      } else {
        const subName = remainder.slice(0, slash)
        if (!seenSub.has(subName)) {
          seenSub.add(subName)
          const subRel = (rel ? rel + '/' : '') + subName
          childFolders.push(listAt(subRel))
        }
      }
    }
    return {
      name: rel === '' ? '' : rel.split('/').pop() ?? '',
      relPath: rel, kind: 'dir',
      children: [...childFolders, ...childFiles],
      truncated: false,
    }
  }

  return {
    pickWorkspace: async () => null,
    setWorkspace: async () => {},
    getWorkspace: async () => null,
    listDir: async (rel = '') => listAt(rel),
    readFile: async (rel): Promise<ReadResult> => {
      const f = files.get(rel)
      if (!f) throw new Error(`ENOENT: ${rel}`)
      return {
        ok: true,
        content: f.content,
        mtimeMs: f.mtimeMs,
        eol: 'lf',
        bom: false,
        size: f.size,
      }
    },
    writeFile: async (rel, content, expectedMtimeMs): Promise<WriteResult> => {
      const f = files.get(rel)
      if (!f) throw new Error(`ENOENT: ${rel}`)
      if (expectedMtimeMs !== undefined && expectedMtimeMs !== f.mtimeMs) {
        throw new Error('stale mtime')
      }
      const next = { ...f, content, mtimeMs: f.mtimeMs + 1, size: content.length }
      files.set(rel, next)
      return { mtimeMs: next.mtimeMs }
    },
    createFile: async (rel, content = ''): Promise<WriteResult> => {
      if (files.has(rel)) throw new Error(`EEXIST: ${rel}`)
      const f: MockFile = { content, mtimeMs: 1, size: content.length, binary: false }
      files.set(rel, f)
      return { mtimeMs: f.mtimeMs }
    },
    createFolder: async (rel) => { folders.add(rel) },
    rename: async (oldRel, newRel) => {
      const f = files.get(oldRel)
      if (!f) throw new Error(`ENOENT: ${oldRel}`)
      if (files.has(newRel)) throw new Error(`EEXIST: ${newRel}`)
      files.delete(oldRel); files.set(newRel, f)
    },
    delete: async (rel) => {
      if (!files.delete(rel)) folders.delete(rel)
    },
    subscribe: () => () => {},
    search: async (_q: SearchQuery): Promise<SearchResult> => ({ matches: [], truncated: false }),
    gitStatus: async () => ({ noRepo: true, branch: null, changed: [], staged: [], untracked: [] }),
    gitDiff: async () => ({ relPath: '', baseRef: '', baseText: '', currentText: '' }),
    readWorkspaceConfig: async () => null,
    writeWorkspaceConfig: async () => true,
    openRemote: async () => ({ kind: 'remote' as const, display: '' }),
    listRecentRemotes: async () => [],
    closeWorkspace: async () => {},
    getWorkspaceKind: async () => null,
    reconnect: async () => {},
    onStatus: () => () => {},
  }
}

export function makeCtx(overrides: Partial<ToolCtx> & { fs: CanvFs }): ToolCtx {
  return {
    activeDocPath: null,
    getEditorContent: () => null,
    applyEditorEdit: async () => {},
    signal: new AbortController().signal,
    ...overrides,
  }
}
