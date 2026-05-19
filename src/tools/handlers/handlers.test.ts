import { describe, it, expect } from 'vitest'
import { listDirTool } from './listDir'
import { readFileTool } from './readFile'
import { makeMockFs, makeCtx } from '../../test/fixtures'
import { MAX_OPEN_BYTES } from '../../lib/fs-limits'

describe('list_dir', () => {
  it('returns immediate children with kind/size', async () => {
    const fs = makeMockFs({
      'notes/a.md': { content: 'hello', mtimeMs: 1, size: 5, binary: false },
      'notes/sub/b.md': { content: 'world', mtimeMs: 2, size: 5, binary: false },
    })
    const out = await listDirTool.handler({ path: 'notes' }, makeCtx({ fs })) as { entries: Array<{ name: string; kind: string; size?: number }> }
    expect(out.entries.find((e) => e.name === 'a.md')).toEqual({ name: 'a.md', kind: 'file', size: 5 })
    expect(out.entries.find((e) => e.name === 'sub')).toEqual({ name: 'sub', kind: 'dir' })
  })

  it('lists root with empty path', async () => {
    const fs = makeMockFs({ 'foo.md': { content: 'x', mtimeMs: 1, size: 1, binary: false } })
    const out = await listDirTool.handler({ path: '' }, makeCtx({ fs })) as { entries: unknown[] }
    expect(out.entries.length).toBe(1)
  })

  it('rejects invalid paths', async () => {
    const fs = makeMockFs({})
    await expect(listDirTool.handler({ path: '../etc' }, makeCtx({ fs }))).rejects.toThrow(/traverse/i)
  })
})

describe('read_file', () => {
  it('returns file content and mtimeMs', async () => {
    const fs = makeMockFs({ 'a.md': { content: 'hello', mtimeMs: 42, size: 5, binary: false } })
    const out = await readFileTool.handler({ path: 'a.md' }, makeCtx({ fs }))
    expect(out).toEqual({ content: 'hello', mtimeMs: 42 })
  })

  it('rejects files larger than the limit', async () => {
    const fs = makeMockFs({ 'big.md': { content: 'x', mtimeMs: 1, size: MAX_OPEN_BYTES + 1, binary: false } })
    await expect(readFileTool.handler({ path: 'big.md' }, makeCtx({ fs }))).rejects.toThrow(/too large/i)
  })

  it('rejects binary files', async () => {
    const fs = makeMockFs({ 'pic.png': { content: '', mtimeMs: 1, size: 100, binary: true } })
    await expect(readFileTool.handler({ path: 'pic.png' }, makeCtx({ fs }))).rejects.toThrow(/binary/i)
  })

  it('rejects invalid paths', async () => {
    const fs = makeMockFs({})
    await expect(readFileTool.handler({ path: '/etc/passwd' }, makeCtx({ fs }))).rejects.toThrow(/absolute/i)
  })

  it('returns active editor content when path matches activeDocPath', async () => {
    const fs = makeMockFs({ 'active.md': { content: 'on disk', mtimeMs: 9, size: 7, binary: false } })
    const ctx = makeCtx({
      fs,
      activeDocPath: 'active.md',
      getEditorContent: (p) => (p === 'active.md' ? 'in editor (unsaved)' : null),
    })
    const out = await readFileTool.handler({ path: 'active.md' }, ctx)
    expect(out).toEqual({ content: 'in editor (unsaved)', mtimeMs: 9 })
  })
})

import { searchWorkspaceTool } from './searchWorkspace'
import type { SearchQuery, SearchResult } from '../../lib/searchTypes'

describe('search_workspace', () => {
  it('forwards a plain query and returns matches', async () => {
    const recorded: SearchQuery[] = []
    const fs = makeMockFs({})
    const result: SearchResult = {
      matches: [{ rel: 'a.md', line: 3, col: 0, snippetCol: 0, matchLen: 3, snippet: 'foo' }],
      truncated: false,
    }
    fs.search = async (q) => { recorded.push(q); return result }
    const out = await searchWorkspaceTool.handler({ query: 'foo' }, makeCtx({ fs }))
    expect(recorded[0]).toEqual({ query: 'foo', regex: false, caseSensitive: false })
    expect(out).toEqual(result)
  })

  it('passes regex / case-sensitive / folder flags through', async () => {
    let captured: SearchQuery | null = null
    const fs = makeMockFs({})
    fs.search = async (q) => { captured = q; return { matches: [], truncated: false } }
    await searchWorkspaceTool.handler(
      { query: '^foo$', regex: true, caseSensitive: true, folder: 'notes' },
      makeCtx({ fs }),
    )
    expect(captured).toEqual({ query: '^foo$', regex: true, caseSensitive: true, folder: 'notes' })
  })

  it('rejects invalid folder', async () => {
    const fs = makeMockFs({})
    await expect(
      searchWorkspaceTool.handler({ query: 'x', folder: '../etc' }, makeCtx({ fs })),
    ).rejects.toThrow(/traverse/i)
  })

  it('rejects empty query', async () => {
    const fs = makeMockFs({})
    await expect(searchWorkspaceTool.handler({ query: '' }, makeCtx({ fs }))).rejects.toThrow(/query/i)
  })
})

import { createFileTool } from './createFile'
import { createFolderTool } from './createFolder'

describe('create_file', () => {
  it('creates a new file with content', async () => {
    const fs = makeMockFs({})
    const out = await createFileTool.handler({ path: 'notes/hello.md', content: 'hi' }, makeCtx({ fs }))
    expect(out).toMatchObject({ path: 'notes/hello.md' })
    expect(await fs.readFile('notes/hello.md')).toEqual({ content: 'hi', mtimeMs: 1 })
  })

  it('creates an empty file when content omitted', async () => {
    const fs = makeMockFs({})
    await createFileTool.handler({ path: 'a.md' }, makeCtx({ fs }))
    expect(await fs.readFile('a.md')).toEqual({ content: '', mtimeMs: 1 })
  })

  it('rejects invalid path', async () => {
    const fs = makeMockFs({})
    await expect(createFileTool.handler({ path: '../x.md' }, makeCtx({ fs }))).rejects.toThrow(/traverse/i)
  })

  it('rejects when file already exists', async () => {
    const fs = makeMockFs({ 'a.md': { content: 'x', mtimeMs: 1, size: 1, binary: false } })
    await expect(createFileTool.handler({ path: 'a.md', content: 'y' }, makeCtx({ fs }))).rejects.toThrow(/exist/i)
  })

  it('is marked as mutating', () => {
    expect(createFileTool.mutating).toBe(true)
  })
})

describe('create_folder', () => {
  it('creates a folder', async () => {
    const fs = makeMockFs({})
    await createFolderTool.handler({ path: 'notes/2026' }, makeCtx({ fs }))
  })

  it('rejects invalid path', async () => {
    const fs = makeMockFs({})
    await expect(createFolderTool.handler({ path: '/abs' }, makeCtx({ fs }))).rejects.toThrow(/absolute/i)
  })

  it('is marked as mutating', () => {
    expect(createFolderTool.mutating).toBe(true)
  })
})

import { deleteFileTool } from './deleteFile'
import { renameFileTool } from './renameFile'

describe('delete_file', () => {
  it('deletes an existing file', async () => {
    const fs = makeMockFs({ 'a.md': { content: 'x', mtimeMs: 1, size: 1, binary: false } })
    await deleteFileTool.handler({ path: 'a.md' }, makeCtx({ fs }))
    await expect(fs.readFile('a.md')).rejects.toThrow(/ENOENT/)
  })

  it('rejects invalid path', async () => {
    const fs = makeMockFs({})
    await expect(deleteFileTool.handler({ path: '..' }, makeCtx({ fs }))).rejects.toThrow(/traverse/i)
  })

  it('is marked as mutating', () => {
    expect(deleteFileTool.mutating).toBe(true)
  })
})

describe('rename_file', () => {
  it('renames a file', async () => {
    const fs = makeMockFs({ 'a.md': { content: 'hi', mtimeMs: 1, size: 2, binary: false } })
    await renameFileTool.handler({ from: 'a.md', to: 'b.md' }, makeCtx({ fs }))
    expect(await fs.readFile('b.md')).toEqual({ content: 'hi', mtimeMs: 1 })
  })

  it('rejects when target exists', async () => {
    const fs = makeMockFs({
      'a.md': { content: 'x', mtimeMs: 1, size: 1, binary: false },
      'b.md': { content: 'y', mtimeMs: 1, size: 1, binary: false },
    })
    await expect(renameFileTool.handler({ from: 'a.md', to: 'b.md' }, makeCtx({ fs }))).rejects.toThrow(/EEXIST/)
  })

  it('rejects invalid paths', async () => {
    const fs = makeMockFs({})
    await expect(renameFileTool.handler({ from: '../x', to: 'y' }, makeCtx({ fs }))).rejects.toThrow(/traverse/i)
    await expect(renameFileTool.handler({ from: 'x', to: '/abs' }, makeCtx({ fs }))).rejects.toThrow(/absolute/i)
  })

  it('is marked as mutating', () => {
    expect(renameFileTool.mutating).toBe(true)
  })
})

import { editFileTool } from './editFile'

describe('edit_file', () => {
  it('overwrites a file on disk', async () => {
    const fs = makeMockFs({ 'a.md': { content: 'old', mtimeMs: 5, size: 3, binary: false } })
    const out = await editFileTool.handler(
      { path: 'a.md', content: 'new content', expectedMtimeMs: 5 },
      makeCtx({ fs }),
    )
    expect(out).toMatchObject({ path: 'a.md' })
    expect(await fs.readFile('a.md')).toMatchObject({ content: 'new content' })
  })

  it('throws on stale mtime', async () => {
    const fs = makeMockFs({ 'a.md': { content: 'x', mtimeMs: 5, size: 1, binary: false } })
    await expect(
      editFileTool.handler({ path: 'a.md', content: 'y', expectedMtimeMs: 999 }, makeCtx({ fs })),
    ).rejects.toThrow(/stale/i)
  })

  it('routes through editor when path is the active doc', async () => {
    const calls: Array<{ path: string; content: string }> = []
    const fs = makeMockFs({ 'open.md': { content: 'on disk', mtimeMs: 1, size: 7, binary: false } })
    const ctx = makeCtx({
      fs,
      activeDocPath: 'open.md',
      getEditorContent: (p) => (p === 'open.md' ? 'in editor' : null),
      applyEditorEdit: async (p, c) => { calls.push({ path: p, content: c }) },
    })
    await editFileTool.handler({ path: 'open.md', content: 'new content' }, ctx)
    expect(calls).toEqual([{ path: 'open.md', content: 'new content' }])
    // Disk untouched.
    expect(await fs.readFile('open.md')).toMatchObject({ content: 'on disk' })
  })

  it('rejects invalid path', async () => {
    const fs = makeMockFs({})
    await expect(editFileTool.handler({ path: '/etc/x', content: 'y' }, makeCtx({ fs }))).rejects.toThrow(/absolute/i)
  })

  it('rejects when file does not exist', async () => {
    const fs = makeMockFs({})
    await expect(editFileTool.handler({ path: 'missing.md', content: 'y' }, makeCtx({ fs }))).rejects.toThrow(/ENOENT/)
  })

  it('is marked as mutating', () => {
    expect(editFileTool.mutating).toBe(true)
  })
})

import { setTodosTool, type TodoItem } from './setTodos'

describe('set_todos', () => {
  it('echoes a validated list back as the tool result', async () => {
    const out = await setTodosTool.handler(
      {
        todos: [
          { content: 'Add foo', activeForm: 'Adding foo', status: 'in_progress' },
          { content: 'Add bar', activeForm: 'Adding bar', status: 'pending' },
        ],
      },
      makeCtx({ fs: makeMockFs({}) }),
    )
    expect(out).toEqual({
      todos: [
        { content: 'Add foo', activeForm: 'Adding foo', status: 'in_progress' },
        { content: 'Add bar', activeForm: 'Adding bar', status: 'pending' },
      ],
    })
  })

  it('accepts an empty list', async () => {
    const out = await setTodosTool.handler({ todos: [] }, makeCtx({ fs: makeMockFs({}) }))
    expect(out).toEqual({ todos: [] })
  })

  it('does not merge with prior state — caller must pass the full list', async () => {
    const ctx = makeCtx({ fs: makeMockFs({}) })
    await setTodosTool.handler(
      { todos: [{ content: 'A', activeForm: 'Doing A', status: 'pending' }] },
      ctx,
    )
    const out = await setTodosTool.handler(
      { todos: [{ content: 'B', activeForm: 'Doing B', status: 'completed' }] },
      ctx,
    )
    expect(out).toEqual({
      todos: [{ content: 'B', activeForm: 'Doing B', status: 'completed' }],
    })
  })

  it('rejects items missing content', async () => {
    await expect(setTodosTool.handler(
      { todos: [{ activeForm: 'Adding foo', status: 'pending' } as unknown as TodoItem] },
      makeCtx({ fs: makeMockFs({}) }),
    )).rejects.toThrow(/content/i)
  })

  it('rejects items missing activeForm', async () => {
    await expect(setTodosTool.handler(
      { todos: [{ content: 'Add foo', status: 'pending' } as unknown as TodoItem] },
      makeCtx({ fs: makeMockFs({}) }),
    )).rejects.toThrow(/activeForm/i)
  })

  it('rejects items with unknown status', async () => {
    await expect(setTodosTool.handler(
      { todos: [{ content: 'Add foo', activeForm: 'Adding foo', status: 'wip' } as unknown as TodoItem] },
      makeCtx({ fs: makeMockFs({}) }),
    )).rejects.toThrow(/status/i)
  })

  it('rejects empty content strings', async () => {
    await expect(setTodosTool.handler(
      { todos: [{ content: '', activeForm: 'Adding foo', status: 'pending' }] },
      makeCtx({ fs: makeMockFs({}) }),
    )).rejects.toThrow(/content/i)
  })

  it('rejects non-object items', async () => {
    await expect(setTodosTool.handler(
      { todos: ['Add foo' as unknown as TodoItem] },
      makeCtx({ fs: makeMockFs({}) }),
    )).rejects.toThrow(/object/i)
  })

  it('rejects two items in_progress at once', async () => {
    await expect(setTodosTool.handler(
      {
        todos: [
          { content: 'A', activeForm: 'Doing A', status: 'in_progress' },
          { content: 'B', activeForm: 'Doing B', status: 'in_progress' },
        ],
      },
      makeCtx({ fs: makeMockFs({}) }),
    )).rejects.toThrow(/only one .* in_progress/i)
  })

  it('accepts exactly one in_progress', async () => {
    const out = await setTodosTool.handler(
      {
        todos: [
          { content: 'A', activeForm: 'Doing A', status: 'in_progress' },
          { content: 'B', activeForm: 'Doing B', status: 'pending' },
        ],
      },
      makeCtx({ fs: makeMockFs({}) }),
    )
    expect(out.todos.length).toBe(2)
  })

  it('accepts zero in_progress', async () => {
    const out = await setTodosTool.handler(
      {
        todos: [
          { content: 'A', activeForm: 'Doing A', status: 'completed' },
          { content: 'B', activeForm: 'Doing B', status: 'pending' },
        ],
      },
      makeCtx({ fs: makeMockFs({}) }),
    )
    expect(out.todos.length).toBe(2)
  })
})
