import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { FileTreeContextMenuExtensions } from './FileTreeContextMenuExtensions'

beforeEach(() => cleanup())
afterEach(() => cleanup())

const MENUS = [
  { extensionId: 'wc', menu: 'fileTree.context', command: 'wc.run', title: 'Count words of this file', when: 'fileExt:.md' },
  { extensionId: 'fmt', menu: 'fileTree.context', command: 'fmt.format', title: 'Format file' },
]
const HANDLERS = [
  { extensionId: 'pdf', id: 'main', extensions: ['.pdf'], mode: 'viewer' as const, entry: 'p.html' },
]

describe('FileTreeContextMenuExtensions', () => {
  it('renders extension items matching the target when clause', () => {
    render(<FileTreeContextMenuExtensions
      target={{ relPath: 'notes.md', isDir: false }}
      menus={MENUS}
      handlers={[]}
      onCommand={() => {}}
      onOpenWith={() => {}}
    />)
    expect(screen.getByText('Count words of this file')).toBeTruthy()
    expect(screen.getByText('Format file')).toBeTruthy()
  })

  it('filters out items whose when clause does not match', () => {
    render(<FileTreeContextMenuExtensions
      target={{ relPath: 'notes.txt', isDir: false }}
      menus={MENUS}
      handlers={[]}
      onCommand={() => {}}
      onOpenWith={() => {}}
    />)
    expect(screen.queryByText('Count words of this file')).toBeNull()
    expect(screen.getByText('Format file')).toBeTruthy()
  })

  it('invokes onCommand with the relPath as the first arg', () => {
    const onCommand = vi.fn()
    render(<FileTreeContextMenuExtensions
      target={{ relPath: 'notes.md', isDir: false }}
      menus={MENUS}
      handlers={[]}
      onCommand={onCommand}
      onOpenWith={() => {}}
    />)
    fireEvent.click(screen.getByText('Count words of this file'))
    expect(onCommand).toHaveBeenCalledWith('wc.run', ['notes.md'])
  })

  it('renders Open with… section listing matching handlers + Text editor', () => {
    const onOpenWith = vi.fn()
    render(<FileTreeContextMenuExtensions
      target={{ relPath: 'paper.pdf', isDir: false }}
      menus={[]}
      handlers={HANDLERS}
      onCommand={() => {}}
      onOpenWith={onOpenWith}
    />)
    expect(screen.getByText(/open with/i)).toBeTruthy()
    expect(screen.getByText('pdf')).toBeTruthy()
    expect(screen.getByText('Text editor')).toBeTruthy()
    fireEvent.click(screen.getByText('Text editor'))
    expect(onOpenWith).toHaveBeenCalledWith(null)
  })
})
