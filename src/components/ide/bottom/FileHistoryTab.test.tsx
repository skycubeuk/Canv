import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FileHistoryTab } from './FileHistoryTab'
import type { FileHistoryEntry } from '../../../lib/historyTypes'

function entry(over: Partial<FileHistoryEntry> = {}): FileHistoryEntry {
  return {
    snapshotId: 'snap_x',
    commit: 'a'.repeat(40),
    createdAt: '2026-05-13T15:40:00Z',
    reason: 'manual',
    summary: 'edit',
    ...over,
  }
}

describe('FileHistoryTab', () => {
  it('renders empty state when no target is set', () => {
    render(<FileHistoryTab
      target={null}
      nonce={0}
      history={{ getFileHistory: vi.fn().mockResolvedValue([]) } as never}
      onOpenDiff={vi.fn()}
      onRestore={vi.fn()}
    />)
    expect(screen.getByText(/Right-click a file/i)).toBeInTheDocument()
  })

  it('fetches and renders versions when a target is provided', async () => {
    const getFileHistory = vi.fn().mockResolvedValue([
      entry({ snapshotId: 's2', summary: 'newer', createdAt: '2026-05-13T16:00:00Z' }),
      entry({ snapshotId: 's1', summary: 'older', createdAt: '2026-05-13T15:00:00Z' }),
    ])
    render(<FileHistoryTab
      target="chapters/ch04.md"
      nonce={1}
      history={{ getFileHistory } as never}
      onOpenDiff={vi.fn()}
      onRestore={vi.fn()}
    />)
    await waitFor(() => expect(getFileHistory).toHaveBeenCalledWith('chapters/ch04.md'))
    expect(await screen.findByText('newer')).toBeInTheDocument()
    expect(screen.getByText('older')).toBeInTheDocument()
    expect(screen.getByText(/ch04\.md/)).toBeInTheDocument()
  })

  it('renders empty state when target has no history', async () => {
    const getFileHistory = vi.fn().mockResolvedValue([])
    render(<FileHistoryTab
      target="never-existed.md"
      nonce={1}
      history={{ getFileHistory } as never}
      onOpenDiff={vi.fn()}
      onRestore={vi.fn()}
    />)
    await waitFor(() => expect(getFileHistory).toHaveBeenCalled())
    expect(await screen.findByText(/No history for this file yet/i)).toBeInTheDocument()
  })

  it('clicking a row fires onOpenDiff with kind fileHistory', async () => {
    const onOpenDiff = vi.fn()
    const getFileHistory = vi.fn().mockResolvedValue([
      entry({ snapshotId: 's2', commit: 'b'.repeat(40), summary: 'newer' }),
    ])
    render(<FileHistoryTab
      target="ch.md"
      nonce={1}
      history={{ getFileHistory } as never}
      onOpenDiff={onOpenDiff}
      onRestore={vi.fn()}
    />)
    fireEvent.click(await screen.findByText('newer'))
    expect(onOpenDiff).toHaveBeenCalledWith({
      kind: 'fileHistory',
      relPath: 'ch.md',
      snapshotId: 's2',
      commitSha: 'b'.repeat(40),
      baseLabel: expect.any(String),
    })
  })

  it('Restore button fires onRestore', async () => {
    const onRestore = vi.fn()
    const getFileHistory = vi.fn().mockResolvedValue([
      entry({ snapshotId: 's2', summary: 'newer' }),
    ])
    render(<FileHistoryTab
      target="ch.md"
      nonce={1}
      history={{ getFileHistory } as never}
      onOpenDiff={vi.fn()}
      onRestore={onRestore}
    />)
    fireEvent.click(await screen.findByTitle(/Restore from this version/i))
    expect(onRestore).toHaveBeenCalledWith({ snapshotId: 's2', relPath: 'ch.md' })
  })

  it('shows loading state while getFileHistory is pending', async () => {
    let resolve: (v: FileHistoryEntry[]) => void = () => {}
    const pending = new Promise<FileHistoryEntry[]>((r) => { resolve = r })
    const getFileHistory = vi.fn().mockReturnValue(pending)
    render(<FileHistoryTab
      target="x.md"
      nonce={1}
      history={{ getFileHistory } as never}
      onOpenDiff={vi.fn()}
      onRestore={vi.fn()}
    />)
    expect(await screen.findByText(/Loading versions/i)).toBeInTheDocument()
    resolve([])
    await waitFor(() => expect(screen.queryByText(/Loading versions/i)).toBeNull())
  })

  it('discards in-flight results from a previous target when retargeted', async () => {
    let resolveA: (v: FileHistoryEntry[]) => void = () => {}
    const pendingA = new Promise<FileHistoryEntry[]>((r) => { resolveA = r })
    const getFileHistory = vi.fn()
      .mockReturnValueOnce(pendingA)
      .mockResolvedValueOnce([entry({ snapshotId: 'sb', summary: 'B-only' })])

    const { rerender } = render(<FileHistoryTab
      target="a.md"
      nonce={1}
      history={{ getFileHistory } as never}
      onOpenDiff={vi.fn()}
      onRestore={vi.fn()}
    />)
    rerender(<FileHistoryTab
      target="b.md"
      nonce={2}
      history={{ getFileHistory } as never}
      onOpenDiff={vi.fn()}
      onRestore={vi.fn()}
    />)
    await screen.findByText('B-only')
    // Now resolve A — should be ignored
    resolveA([entry({ snapshotId: 'sa', summary: 'A-only' })])
    // Give microtask flush
    await Promise.resolve()
    await Promise.resolve()
    expect(screen.queryByText('A-only')).toBeNull()
    expect(screen.getByText('B-only')).toBeInTheDocument()
  })

  it('refetches when nonce changes (retarget)', async () => {
    const getFileHistory = vi.fn().mockResolvedValue([])
    const { rerender } = render(<FileHistoryTab
      target="a.md"
      nonce={1}
      history={{ getFileHistory } as never}
      onOpenDiff={vi.fn()}
      onRestore={vi.fn()}
    />)
    await waitFor(() => expect(getFileHistory).toHaveBeenCalledWith('a.md'))
    rerender(<FileHistoryTab
      target="b.md"
      nonce={2}
      history={{ getFileHistory } as never}
      onOpenDiff={vi.fn()}
      onRestore={vi.fn()}
    />)
    await waitFor(() => expect(getFileHistory).toHaveBeenLastCalledWith('b.md'))
  })
})
