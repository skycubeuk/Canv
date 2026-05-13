import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HistoryTab } from './HistoryTab'
import type { SnapshotEntry } from '../../../lib/historyTypes'

function snap(over: Partial<SnapshotEntry> = {}): SnapshotEntry {
  return {
    id: 'snap_x',
    commit: 'a'.repeat(40),
    createdAt: '2026-05-13T15:40:00Z',
    reason: 'manual',
    summary: 'edit',
    files: ['a.md'],
    hidden: false,
    metadata: {},
    ...over,
  }
}

const onOpenDiff = vi.fn()
const onRestore = vi.fn()
const onCreateCheckpoint = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  onOpenDiff.mockReset()
  onRestore.mockReset()
  onCreateCheckpoint.mockReset()
  onCreateCheckpoint.mockResolvedValue(undefined)
})

describe('HistoryTab', () => {
  it('lists current changes and snapshots', async () => {
    const history = {
      getCurrentChanges: vi.fn().mockResolvedValue([{ relPath: 'a.md', status: 'modified' }]),
      listSnapshots: vi.fn().mockResolvedValue([
        snap({ id: 's1' }),
        snap({ id: 's0', reason: 'workspace_init', summary: 'init' }),
      ]),
      hideSnapshot: vi.fn(),
      getTipCommit: vi.fn().mockResolvedValue('a'.repeat(40)),
    }
    render(<HistoryTab history={history as never} onOpenDiff={onOpenDiff} onCreateCheckpoint={onCreateCheckpoint} onRestore={onRestore} />)
    await waitFor(() => expect(screen.getByText('a.md')).toBeInTheDocument())
    expect(screen.getByText(/edit/)).toBeInTheDocument()
    expect(screen.getByText(/init/)).toBeInTheDocument()
  })

  it('clicking a changed file fires onOpenDiff with kind=current and baseSha', async () => {
    const tipSha = 'a'.repeat(40)
    const history = {
      getCurrentChanges: vi.fn().mockResolvedValue([{ relPath: 'a.md', status: 'modified' }]),
      listSnapshots: vi.fn().mockResolvedValue([]),
      hideSnapshot: vi.fn(),
      getTipCommit: vi.fn().mockResolvedValue(tipSha),
    }
    render(<HistoryTab history={history as never} onOpenDiff={onOpenDiff} onCreateCheckpoint={onCreateCheckpoint} onRestore={onRestore} />)
    await waitFor(() => screen.getByText('a.md'))
    fireEvent.click(screen.getByText('a.md'))
    expect(onOpenDiff).toHaveBeenCalledWith(expect.objectContaining({ kind: 'current', relPath: 'a.md', baseSha: tipSha, baseLabel: expect.any(String) }))
  })

  it('expanding a snapshot reveals per-file diff/restore actions', async () => {
    const commitSha = 'b'.repeat(40)
    const history = {
      getCurrentChanges: vi.fn().mockResolvedValue([]),
      listSnapshots: vi.fn().mockResolvedValue([snap({ id: 's1', commit: commitSha, files: ['a.md'] })]),
      hideSnapshot: vi.fn(),
      getTipCommit: vi.fn().mockResolvedValue('a'.repeat(40)),
    }
    render(<HistoryTab history={history as never} onOpenDiff={onOpenDiff} onCreateCheckpoint={onCreateCheckpoint} onRestore={onRestore} />)
    await waitFor(() => screen.getByText(/edit/))
    fireEvent.click(screen.getByText(/edit/))
    expect(screen.getByText('diff')).toBeInTheDocument()
    expect(screen.getByText('restore')).toBeInTheDocument()
    fireEvent.click(screen.getByText('diff'))
    expect(onOpenDiff).toHaveBeenCalledWith(expect.objectContaining({ kind: 'snapshot', snapshotId: 's1', relPath: 'a.md', commitSha, baseLabel: expect.any(String) }))
    fireEvent.click(screen.getByText('restore'))
    expect(onRestore).toHaveBeenCalledWith({ snapshotId: 's1', relPath: 'a.md' })
  })

  it('Create checkpoint submits the composed summary', async () => {
    const history = {
      getCurrentChanges: vi.fn().mockResolvedValue([]),
      listSnapshots: vi.fn().mockResolvedValue([]),
      hideSnapshot: vi.fn(),
      getTipCommit: vi.fn().mockResolvedValue('a'.repeat(40)),
    }
    render(<HistoryTab history={history as never} onOpenDiff={onOpenDiff} onCreateCheckpoint={onCreateCheckpoint} onRestore={onRestore} />)
    fireEvent.click(screen.getByRole('button', { name: /Create checkpoint/i }))
    const input = screen.getByDisplayValue('Manual checkpoint')
    fireEvent.change(input, { target: { value: 'After chapter 4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onCreateCheckpoint).toHaveBeenCalledWith('After chapter 4'))
  })

  it('Show hidden toggle reloads the list with includeHidden', async () => {
    const history = {
      getCurrentChanges: vi.fn().mockResolvedValue([]),
      listSnapshots: vi.fn().mockResolvedValue([]),
      hideSnapshot: vi.fn(),
      getTipCommit: vi.fn().mockResolvedValue('a'.repeat(40)),
    }
    render(<HistoryTab history={history as never} onOpenDiff={onOpenDiff} onCreateCheckpoint={onCreateCheckpoint} onRestore={onRestore} />)
    await waitFor(() => expect(history.listSnapshots).toHaveBeenCalledWith({ includeHidden: false }))
    fireEvent.click(screen.getByLabelText(/Show hidden/i))
    await waitFor(() => expect(history.listSnapshots).toHaveBeenCalledWith({ includeHidden: true }))
  })

  it('hides snapshots whose reason is deselected', async () => {
    const history = {
      getCurrentChanges: vi.fn().mockResolvedValue([]),
      listSnapshots: vi.fn().mockResolvedValue([
        snap({ id: 's1', reason: 'manual', summary: 'a manual one' }),
        snap({ id: 's2', reason: 'idle_autosave', summary: 'an idle one' }),
      ]),
      hideSnapshot: vi.fn(),
      getTipCommit: vi.fn().mockResolvedValue('a'.repeat(40)),
    }
    render(<HistoryTab history={history as never} onOpenDiff={onOpenDiff} onCreateCheckpoint={onCreateCheckpoint} onRestore={onRestore} />)
    await waitFor(() => expect(screen.getByText('a manual one')).toBeInTheDocument())
    expect(screen.getByText('an idle one')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Hide Idle/i }))
    expect(screen.queryByText('an idle one')).not.toBeInTheDocument()
    expect(screen.getByText('a manual one')).toBeInTheDocument()
  })
})
