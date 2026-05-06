import { describe, it, expect } from 'vitest'
import { buildInventory, formatInventoryForPrompt } from './inventory'
import type { DirNode } from './fs'

const tree: DirNode = {
  name: '', relPath: '', kind: 'dir', truncated: false,
  children: [
    { name: 'README.md', relPath: 'README.md', kind: 'file', mtimeMs: 1, size: 100, binary: false },
    { name: 'notes', relPath: 'notes', kind: 'dir', truncated: false, children: [
      { name: 'a.md', relPath: 'notes/a.md', kind: 'file', mtimeMs: 1, size: 10, binary: false },
      { name: 'sub', relPath: 'notes/sub', kind: 'dir', truncated: false, children: [
        { name: 'b.md', relPath: 'notes/sub/b.md', kind: 'file', mtimeMs: 1, size: 5, binary: false },
        { name: 'deep', relPath: 'notes/sub/deep', kind: 'dir', truncated: false, children: [
          { name: 'c.md', relPath: 'notes/sub/deep/c.md', kind: 'file', mtimeMs: 1, size: 1, binary: false },
        ] },
      ] },
    ] },
  ],
}

describe('buildInventory', () => {
  it('emits active doc + pinned + tree', () => {
    const inv = buildInventory({
      tree,
      activeDocPath: 'notes/a.md',
      activeDocLineCount: 12,
      pinned: ['README.md'],
      maxDepth: 3,
      maxFilesPerFolder: 200,
    })
    expect(inv.activeDoc).toEqual({ path: 'notes/a.md', lines: 12 })
    expect(inv.pinned).toEqual(['README.md'])
    expect(inv.tree.path).toBe('')
  })

  it('clips at maxDepth', () => {
    const inv = buildInventory({ tree, activeDocPath: null, pinned: [], maxDepth: 2, maxFilesPerFolder: 200 })
    const notes = inv.tree.children!.find((c) => c.path === 'notes')!
    const sub = notes.children!.find((c) => c.path === 'notes/sub')!
    expect(sub.kind).toBe('dir')
    expect(sub.children).toBeUndefined()
    expect(sub.truncated).toBe(true)
  })

  it('truncates folders with too many files', () => {
    const big: DirNode = {
      name: 'big', relPath: 'big', kind: 'dir', truncated: false,
      children: Array.from({ length: 5 }, (_, i) => ({
        name: `f${i}.md`, relPath: `big/f${i}.md`, kind: 'file' as const,
        mtimeMs: 1, size: 1, binary: false,
      })),
    }
    const root: DirNode = { name: '', relPath: '', kind: 'dir', truncated: false, children: [big] }
    const inv = buildInventory({ tree: root, activeDocPath: null, pinned: [], maxDepth: 3, maxFilesPerFolder: 2 })
    const bigOut = inv.tree.children!.find((c) => c.path === 'big')!
    expect(bigOut.children!.length).toBe(2)
    expect(bigOut.truncated).toBe(true)
  })

  it('formats as a system-prompt block', () => {
    const inv = buildInventory({
      tree, activeDocPath: 'notes/a.md', activeDocLineCount: 12,
      pinned: ['README.md'], maxDepth: 3, maxFilesPerFolder: 200,
    })
    const text = formatInventoryForPrompt(inv)
    expect(text).toContain('Workspace inventory')
    expect(text).toContain('notes/a.md')
    expect(text).toContain('"pinned"')
  })
})
