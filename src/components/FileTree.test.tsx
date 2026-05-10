import { describe, it, expect, vi } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import type { ReactElement } from 'react'
import { FileTree } from './FileTree'
import type { DirNode } from '../lib/fs'
import { DialogProvider } from '../lib/dialogs'

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: DialogProvider })

function singleFileTree(rel = 'foo.md'): DirNode {
  return {
    name: 'root', relPath: '', kind: 'dir', truncated: false,
    children: [{ name: rel, relPath: rel, kind: 'file', binary: false, mtimeMs: 0, size: 0 }],
  }
}

const noopProps = {
  root: '/ws/test',
  truncated: false,
  openRels: new Set<string>(),
  activeRel: null,
  onOpen: vi.fn(),
  onPin: vi.fn(),
  onUnpin: vi.fn(),
  onCreateFile: vi.fn(),
  onCreateFolder: vi.fn(),
  onRename: vi.fn(),
  onDelete: vi.fn(),
  onChangeWorkspace: vi.fn(),
}

describe('FileTree — pin badge and context menu', () => {
  it('renders no pin badge for an unpinned file row', () => {
    render(
      <FileTree
        {...noopProps}
        tree={singleFileTree()}
        pinnedRels={new Set<string>()}
      />,
    )
    expect(screen.queryByLabelText(/pinned to context/i)).toBeNull()
  })

  it('renders pin badge for a pinned file row', () => {
    render(
      <FileTree
        {...noopProps}
        tree={singleFileTree()}
        pinnedRels={new Set(['foo.md'])}
      />,
    )
    expect(screen.getByLabelText(/foo.md pinned to context/i)).toBeInTheDocument()
  })

  it('right-click on an unpinned .md shows Pin to context', () => {
    const onPin = vi.fn()
    render(
      <FileTree
        {...noopProps}
        tree={singleFileTree()}
        pinnedRels={new Set<string>()}
        onPin={onPin}
      />,
    )
    const row = screen.getByText('foo.md').closest('div')!
    fireEvent.contextMenu(row, { clientX: 10, clientY: 10 })
    expect(screen.getByText('Pin to context')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Pin to context'))
    expect(onPin).toHaveBeenCalledWith('foo.md')
  })

  it('right-click on a pinned file shows Unpin from context', () => {
    const onUnpin = vi.fn()
    render(
      <FileTree
        {...noopProps}
        tree={singleFileTree()}
        pinnedRels={new Set(['foo.md'])}
        onUnpin={onUnpin}
      />,
    )
    const row = screen.getByText('foo.md').closest('div')!
    fireEvent.contextMenu(row, { clientX: 10, clientY: 10 })
    expect(screen.getByText('Unpin from context')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Unpin from context'))
    expect(onUnpin).toHaveBeenCalledWith('foo.md')
  })
})
