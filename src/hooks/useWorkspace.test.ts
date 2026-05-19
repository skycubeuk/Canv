import { describe, it, expect, beforeEach, vi } from 'vitest'

// Stub the Electron fs bridge so the hook believes it has a workspace.
const fsMock = {
  pickWorkspace: vi.fn(),
  setWorkspace: vi.fn(),
  getWorkspace: vi.fn(),
  listDir: vi.fn().mockResolvedValue({ name: '', relPath: '', kind: 'dir', children: [], truncated: false }),
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue({ mtimeMs: Date.now() }),
  createFile: vi.fn(),
  createFolder: vi.fn(),
  rename: vi.fn(),
  delete: vi.fn(),
  subscribe: vi.fn(() => () => {}),
  openRemote: vi.fn(),
  listRecentRemotes: vi.fn().mockResolvedValue([]),
  closeWorkspace: vi.fn(),
  getWorkspaceKind: vi.fn().mockResolvedValue(null),
  reconnect: vi.fn(),
  onStatus: vi.fn().mockReturnValue(() => {}),
}

beforeEach(() => {
  ;(globalThis as { window?: Window }).window = window
  ;(window as unknown as { canvFS: typeof fsMock }).canvFS = fsMock
  localStorage.clear()
  fsMock.readFile.mockReset()
  fsMock.readFile.mockImplementation(async (rel: string) => ({ ok: true, content: `# ${rel}`, mtimeMs: 1, eol: 'lf', bom: false, size: 0 }))
})

import { renderHook, act } from '@testing-library/react'
import { useWorkspace } from './useWorkspace'
import { wsKey } from '../lib/wsKey'

async function withWorkspace() {
  const hook = renderHook(() => useWorkspace({ saveDebounceMs: 50 }))
  await act(async () => {
    // Force-adopt the test workspace by writing the LAST_WS_KEY beforehand isn't easy; instead,
    // we drive the hook through pickWorkspace's side effect by mocking it to return our root.
    fsMock.pickWorkspace.mockResolvedValueOnce({ root: '/ws/test' })
    await hook.result.current.pickWorkspace()
  })
  return hook
}

describe('useWorkspace — diff tabs', () => {
  it('openDiffTab opens a diff tab in the active group', async () => {
    const hook = await withWorkspace()
    await act(async () => {
      await hook.result.current.openDiffTab('notes/chapter-1.md', 'HEAD')
    })
    const g1 = hook.result.current.editorGroups[0]
    expect(g1.openTabs).toHaveLength(1)
    expect(g1.openTabs[0]).toMatchObject({ kind: 'diff', relPath: 'notes/chapter-1.md', baseRef: 'HEAD' })
    expect(g1.activeTabKey).toBe('diff:notes/chapter-1.md@HEAD')
  })

  it('openDiffTab is a singleton: re-opening focuses the existing tab', async () => {
    const hook = await withWorkspace()
    await act(async () => {
      await hook.result.current.openDiffTab('a.md', 'HEAD')
      await hook.result.current.openDiffTab('a.md', 'HEAD')
    })
    expect(hook.result.current.editorGroups[0].openTabs).toHaveLength(1)
  })

  it('closeTabByKey closes a diff tab', async () => {
    const hook = await withWorkspace()
    await act(async () => {
      await hook.result.current.openDiffTab('a.md', 'HEAD')
      await hook.result.current.closeTabByKey('diff:a.md@HEAD')
    })
    expect(hook.result.current.editorGroups[0].openTabs).toHaveLength(0)
  })

  it('diff tab key is persisted and restored', async () => {
    const hook = await withWorkspace()
    await act(async () => {
      await hook.result.current.openDiffTab('a.md', 'HEAD')
    })
    // Simulate a reload: reset and re-adopt the same root.
    const hook2 = renderHook(() => useWorkspace({ saveDebounceMs: 50 }))
    ;(window as unknown as { canvFS: typeof fsMock }).canvFS = fsMock
    fsMock.pickWorkspace.mockResolvedValueOnce({ root: '/ws/test' })
    await act(async () => { await hook2.result.current.pickWorkspace() })
    const restored = hook2.result.current.editorGroups[0].openTabs
    expect(restored.some((t) => t.kind === 'diff' && t.relPath === 'a.md' && t.baseRef === 'HEAD')).toBe(true)
  })
})

describe('useWorkspace — split groups', () => {
  it('starts with a single empty group g1', async () => {
    const hook = await withWorkspace()
    expect(hook.result.current.editorGroups).toHaveLength(1)
    expect(hook.result.current.editorGroups[0].id).toBe('g1')
    expect(hook.result.current.activeGroupId).toBe('g1')
  })

  it('splitRight clones the active tab into g2 and focuses it', async () => {
    const hook = await withWorkspace()
    await act(async () => { await hook.result.current.openTab('a.md') })
    act(() => { hook.result.current.splitRight() })
    expect(hook.result.current.editorGroups).toHaveLength(2)
    expect(hook.result.current.editorGroups[1].id).toBe('g2')
    expect(hook.result.current.editorGroups[1].activeTabKey).toBe('a.md')
    expect(hook.result.current.activeGroupId).toBe('g2')
  })

  it('moveTab transfers an open tab between groups', async () => {
    const hook = await withWorkspace()
    await act(async () => { await hook.result.current.openTab('a.md') })
    act(() => { hook.result.current.splitRight() })
    await act(async () => { await hook.result.current.openTab('b.md', 'g2') })
    act(() => { hook.result.current.moveTab('b.md', 'g2', 'g1') })
    const g1 = hook.result.current.editorGroups.find((g) => g.id === 'g1')!
    const g2 = hook.result.current.editorGroups.find((g) => g.id === 'g2')!
    expect(g1.openTabs.map((t) => t.kind === 'markdown' ? t.relPath : 'settings')).toContain('b.md')
    expect(g2.openTabs.map((t) => t.kind === 'markdown' ? t.relPath : 'settings')).not.toContain('b.md')
  })

  it('closing the last tab in g2 collapses back to single group', async () => {
    const hook = await withWorkspace()
    await act(async () => { await hook.result.current.openTab('a.md') })
    act(() => { hook.result.current.splitRight() })
    await act(async () => { await hook.result.current.closeTabByKey('a.md', 'g2') })
    expect(hook.result.current.editorGroups).toHaveLength(1)
    expect(hook.result.current.editorGroups[0].id).toBe('g1')
    expect(hook.result.current.activeGroupId).toBe('g1')
  })

  it('settings is a singleton — opening from a different group focuses the existing one', async () => {
    const hook = await withWorkspace()
    await act(async () => { await hook.result.current.openTab('a.md') })
    act(() => { hook.result.current.splitRight() })
    act(() => { hook.result.current.openSettingsTab('g1') })
    expect(hook.result.current.editorGroups.find((g) => g.id === 'g1')?.openTabs.some((t) => t.kind === 'settings')).toBe(true)
    act(() => { hook.result.current.openSettingsTab('g2') })
    // Still only one settings tab, in g1; activeGroupId moves to g1.
    const allSettings = hook.result.current.editorGroups.flatMap((g) => g.openTabs.filter((t) => t.kind === 'settings'))
    expect(allSettings).toHaveLength(1)
    expect(hook.result.current.activeGroupId).toBe('g1')
  })

  it('saving in one group propagates loadedMarkdown to the other group with the same file', async () => {
    // First open the file so the writeFile mock won't throw.
    fsMock.writeFile.mockResolvedValueOnce({ mtimeMs: 99 })
    const hook = await withWorkspace()
    await act(async () => { await hook.result.current.openTab('a.md') })
    act(() => { hook.result.current.splitRight() })
    // Both groups now have a.md with their own (initial) loadedMarkdown.
    // Simulate a save from g1.
    act(() => { hook.result.current.saveTab('a.md', 'updated', 'g1') })
    // Wait for the debounce timer (1s) and a microtask for the awaited writeFile.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100))
    })
    const groups = hook.result.current.editorGroups
    const g1Tab = groups.find((g) => g.id === 'g1')!.openTabs.find((t) => t.kind === 'markdown' && t.relPath === 'a.md')
    const g2Tab = groups.find((g) => g.id === 'g2')!.openTabs.find((t) => t.kind === 'markdown' && t.relPath === 'a.md')
    expect(g1Tab && g1Tab.kind === 'markdown' ? g1Tab.loadedMarkdown : 'wrong').not.toBe('updated')
    expect(g2Tab && g2Tab.kind === 'markdown' ? g2Tab.loadedMarkdown : 'wrong').toBe('updated')
  })

  it('persists groups + activeGroupId; restores them on remount', async () => {
    const hook = await withWorkspace()
    await act(async () => { await hook.result.current.openTab('a.md') })
    act(() => { hook.result.current.splitRight() })
    await act(async () => { await hook.result.current.openTab('b.md', 'g2') })
    hook.unmount()

    fsMock.pickWorkspace.mockResolvedValueOnce({ root: '/ws/test' })
    const second = renderHook(() => useWorkspace({ saveDebounceMs: 50 }))
    await act(async () => { await second.result.current.pickWorkspace() })
    expect(second.result.current.editorGroups).toHaveLength(2)
    const g1 = second.result.current.editorGroups.find((g) => g.id === 'g1')!
    const g2 = second.result.current.editorGroups.find((g) => g.id === 'g2')!
    expect(g1.openTabs.map((t) => t.kind === 'markdown' ? t.relPath : 'settings')).toContain('a.md')
    expect(g2.openTabs.map((t) => t.kind === 'markdown' ? t.relPath : 'settings')).toContain('b.md')
    expect(second.result.current.activeGroupId).toBe('g2')
  })
})

describe('useWorkspace — pin context', () => {
  it('upgrades old string[] persisted pinned format to {relPath, mtimeMs}', async () => {
    localStorage.setItem(wsKey('/ws/test', 'pinned'), JSON.stringify(['foo.md']))
    fsMock.readFile.mockImplementation(async (rel: string) => ({ ok: true, content: `# ${rel}`, mtimeMs: 7, eol: 'lf', bom: false, size: 0 }))
    const hook = await withWorkspace()
    const pinned = hook.result.current.pinned
    expect(pinned).toHaveLength(1)
    expect(pinned[0].relPath).toBe('foo.md')
    expect(pinned[0].mtimeMs).toBe(7)
  })

  it('pin records {relPath, mtimeMs} and persists', async () => {
    fsMock.readFile.mockImplementation(async (rel: string) => ({ ok: true, content: `BODY ${rel}`, mtimeMs: 9, eol: 'lf', bom: false, size: 0 }))
    const hook = await withWorkspace()
    await act(async () => { await hook.result.current.pin('a.md') })
    const entry = hook.result.current.pinned.find((p) => p.relPath === 'a.md')!
    expect(entry).toBeDefined()
    expect(entry.relPath).toBe('a.md')
    expect(entry.mtimeMs).toBe(9)
  })

  it('pin is idempotent — pinning twice leaves one entry', async () => {
    fsMock.readFile.mockImplementation(async (rel: string) => ({ ok: true, content: `# ${rel}`, mtimeMs: 1, eol: 'lf', bom: false, size: 0 }))
    const hook = await withWorkspace()
    await act(async () => { await hook.result.current.pin('b.md') })
    await act(async () => { await hook.result.current.pin('b.md') })
    expect(hook.result.current.pinned.filter((p) => p.relPath === 'b.md')).toHaveLength(1)
  })

  it('unpin removes the entry', async () => {
    fsMock.readFile.mockImplementation(async () => ({ ok: true, content: 'BODY', mtimeMs: 1, eol: 'lf', bom: false, size: 0 }))
    const hook = await withWorkspace()
    await act(async () => { await hook.result.current.pin('d.md') })
    await act(async () => { await hook.result.current.unpin('d.md') })
    expect(hook.result.current.pinned.find((p) => p.relPath === 'd.md')).toBeUndefined()
  })

  it('persists pin as {rel} shape and restores on remount', async () => {
    fsMock.readFile.mockImplementation(async () => ({ ok: true, content: 'BODY', mtimeMs: 1, eol: 'lf', bom: false, size: 0 }))
    const hook = await withWorkspace()
    await act(async () => { await hook.result.current.pin('e.md') })
    const raw = localStorage.getItem(wsKey('/ws/test', 'pinned'))
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as unknown
    expect(parsed).toEqual([{ rel: 'e.md' }])

    // Restore on remount.
    fsMock.pickWorkspace.mockResolvedValueOnce({ root: '/ws/test' })
    const hook2 = renderHook(() => useWorkspace({ saveDebounceMs: 50 }))
    await act(async () => { await hook2.result.current.pickWorkspace() })
    expect(hook2.result.current.pinned.find((p) => p.relPath === 'e.md')).toBeDefined()
  })

  it('upgrades legacy {rel, mode} shape from localStorage', async () => {
    localStorage.setItem(wsKey('/ws/test', 'pinned'), JSON.stringify([{ rel: 'foo.md', mode: 'full' }]))
    fsMock.readFile.mockImplementation(async (rel: string) => ({ ok: true, content: `# ${rel}`, mtimeMs: 5, eol: 'lf', bom: false, size: 0 }))
    const hook = await withWorkspace()
    const pinned = hook.result.current.pinned
    expect(pinned).toHaveLength(1)
    expect(pinned[0].relPath).toBe('foo.md')
    expect(pinned[0].mtimeMs).toBe(5)
  })
})

describe('useWorkspace — markdown content fidelity', () => {
  const FIXTURES: Array<{ name: string; content: string }> = [
    {
      name: 'newline-after-bold',
      content: '**Summary:**\nA paragraph follows.\n',
    },
    {
      name: 'loose-list',
      content: '- item one\n\n- item two\n\n- item three\n',
    },
    {
      name: 'trailing-newline',
      content: '# Heading\n\nBody.\n',
    },
    {
      name: 'no-trailing-newline',
      content: '# Heading\n\nBody.',
    },
    {
      name: 'fenced-code',
      content: '```ts\nconst x = 1\n```\n',
    },
    {
      name: 'table',
      content: '| a | b |\n| --- | --- |\n| 1 | 2 |\n',
    },
  ]

  for (const { name, content } of FIXTURES) {
    it(`opens "${name}" via openTab without modifying loadedMarkdown`, async () => {
      fsMock.readFile.mockImplementation(async () => ({ ok: true, content, mtimeMs: 1, eol: 'lf', bom: false, size: 0 }))
      const hook = await withWorkspace()
      await act(async () => { await hook.result.current.openTab(`${name}.md`) })
      const tab = hook.result.current.editorGroups[0].openTabs.find(
        (t) => t.kind === 'markdown' && t.relPath === `${name}.md`,
      ) as { kind: 'markdown'; loadedMarkdown: string } | undefined
      expect(tab).toBeDefined()
      expect(tab!.loadedMarkdown).toBe(content)
    })
  }

  it('saving an unedited file does not call writeFile (writeFile is only invoked on dirty save)', async () => {
    fsMock.readFile.mockImplementation(async () => ({ ok: true, content: 'unchanged\n', mtimeMs: 1, eol: 'lf', bom: false, size: 0 }))
    fsMock.writeFile.mockClear()
    const hook = await withWorkspace()
    await act(async () => { await hook.result.current.openTab('clean.md') })
    await act(async () => { await hook.result.current.flushAll() })
    expect(fsMock.writeFile).not.toHaveBeenCalled()
  })
})

describe('useWorkspace — watcher own-write suppression', () => {
  // Capture the chokidar callback the hook registers, so tests can replay
  // 'change' events with arbitrary timing.
  let watcherCb: ((ev: { type: string; relPath: string; mtimeMs?: number }) => void) | null = null

  beforeEach(() => {
    watcherCb = null
    ;(fsMock.subscribe as unknown as {
      mockImplementation: (fn: (cb: (ev: { type: string; relPath: string; mtimeMs?: number }) => void) => () => void) => void
    }).mockImplementation((cb) => {
      watcherCb = cb
      return () => {}
    })
  })

  it('suppresses our own write echo even when chokidar reports it long after the write resolved', async () => {
    const OWN_MTIME = 1_778_587_350_985.5952
    fsMock.readFile.mockImplementation(async () => ({ ok: true, content: 'hello', mtimeMs: 1, eol: 'lf', bom: false, size: 0 }))
    fsMock.writeFile.mockResolvedValue({ mtimeMs: OWN_MTIME })

    const hook = await withWorkspace()
    await act(async () => { await hook.result.current.openTab('body.md') })
    // Trigger a save and let the 1s debounce + writeFile resolve.
    act(() => { hook.result.current.saveTab('body.md', 'edited') })
    await act(async () => { await new Promise((r) => setTimeout(r, 1100)) })
    expect(fsMock.writeFile).toHaveBeenCalled()

    // Now simulate the chokidar 'change' echo arriving 1500ms later —
    // well past the previous 250ms suppression window, but still our own
    // write (same mtimeMs as what writeFile returned).
    await act(async () => { await new Promise((r) => setTimeout(r, 1500)) })
    expect(watcherCb).not.toBeNull()
    act(() => { watcherCb!({ type: 'change', relPath: 'body.md', mtimeMs: OWN_MTIME }) })

    expect(hook.result.current.conflict).toBeNull()
  })

  it('still raises a conflict when an external write produces a different mtime', async () => {
    const OWN_MTIME = 2_000
    const EXTERNAL_MTIME = 2_500
    fsMock.readFile.mockImplementation(async () => ({ ok: true, content: 'hello', mtimeMs: 1, eol: 'lf', bom: false, size: 0 }))
    fsMock.writeFile.mockResolvedValue({ mtimeMs: OWN_MTIME })

    const hook = await withWorkspace()
    await act(async () => { await hook.result.current.openTab('body.md') })
    act(() => { hook.result.current.saveTab('body.md', 'edited') })
    await act(async () => { await new Promise((r) => setTimeout(r, 1100)) })

    expect(watcherCb).not.toBeNull()
    await act(async () => {
      watcherCb!({ type: 'change', relPath: 'body.md', mtimeMs: EXTERNAL_MTIME })
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(hook.result.current.conflict).toEqual({ relPath: 'body.md', diskMtimeMs: EXTERNAL_MTIME })
  })

  it('suppresses the conflict when chokidar reports a drifted mtime but disk content equals what we wrote', async () => {
    // Reproduces the Windows symptom: chokidar's stabilised stat returns a
    // slightly different mtime than the post-writeFile stat (NTFS metadata
    // lazy-flush / AV touch), falling outside the 2 ms fast-path tolerance.
    // The disk bytes are still exactly what we wrote, so the second-check
    // should suppress the popup.
    const OWN_MTIME = 1_778_587_350_985.5952
    const DRIFTED_MTIME = 1_778_587_350_990.1234 // ~5 ms drift
    fsMock.readFile.mockImplementation(async () => ({ ok: true, content: 'hello', mtimeMs: 1, eol: 'lf', bom: false, size: 0 }))
    fsMock.writeFile.mockResolvedValue({ mtimeMs: OWN_MTIME })

    const hook = await withWorkspace()
    await act(async () => { await hook.result.current.openTab('body.md') })
    act(() => { hook.result.current.saveTab('body.md', 'edited') })
    await act(async () => { await new Promise((r) => setTimeout(r, 1100)) })
    expect(fsMock.writeFile).toHaveBeenCalled()

    // The disk now holds the bytes we wrote, but stat returns a drifted mtime.
    fsMock.readFile.mockImplementation(async () => ({ ok: true, content: 'edited', mtimeMs: DRIFTED_MTIME, eol: 'lf', bom: false, size: 0 }))

    expect(watcherCb).not.toBeNull()
    await act(async () => {
      watcherCb!({ type: 'change', relPath: 'body.md', mtimeMs: DRIFTED_MTIME })
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(hook.result.current.conflict).toBeNull()
  })

  it('still raises a conflict when content actually differs, even if recentWrites has an entry', async () => {
    // Adversarial case for the second-check: an external program writes
    // different bytes between our last save and the event arriving.
    const OWN_MTIME = 4_000
    const EXTERNAL_MTIME = 4_500
    fsMock.readFile.mockImplementation(async () => ({ ok: true, content: 'hello', mtimeMs: 1, eol: 'lf', bom: false, size: 0 }))
    fsMock.writeFile.mockResolvedValue({ mtimeMs: OWN_MTIME })

    const hook = await withWorkspace()
    await act(async () => { await hook.result.current.openTab('body.md') })
    act(() => { hook.result.current.saveTab('body.md', 'edited') })
    await act(async () => { await new Promise((r) => setTimeout(r, 1100)) })

    // External program has overwritten the file with different bytes.
    fsMock.readFile.mockImplementation(async () => ({ ok: true, content: 'something-else', mtimeMs: EXTERNAL_MTIME, eol: 'lf', bom: false, size: 0 }))

    await act(async () => {
      watcherCb!({ type: 'change', relPath: 'body.md', mtimeMs: EXTERNAL_MTIME })
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(hook.result.current.conflict).toEqual({ relPath: 'body.md', diskMtimeMs: EXTERNAL_MTIME })
  })

  it('noteOwnDiskWrite seeds recentWrites so the watcher does not raise a conflict', async () => {
    const RESTORE_MTIME = 3_000
    fsMock.readFile.mockImplementation(async () => ({ ok: true, content: 'original', mtimeMs: 1, eol: 'lf', bom: false, size: 0 }))

    const hook = await withWorkspace()
    await act(async () => { await hook.result.current.openTab('body.md') })

    // Simulate what App.tsx does after restoreFile resolves: note the mtime,
    // then the watcher 'change' event echoes back with that same mtime.
    act(() => { hook.result.current.noteOwnDiskWrite('body.md', RESTORE_MTIME) })
    act(() => { watcherCb!({ type: 'change', relPath: 'body.md', mtimeMs: RESTORE_MTIME }) })

    expect(hook.result.current.conflict).toBeNull()
  })
})
