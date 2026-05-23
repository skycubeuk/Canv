import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Files, Search } from 'lucide-react'
import { ActivityBar } from './ActivityBar'

beforeEach(() => cleanup())

const BUILTIN_TABS = [
  { id: 'files', label: 'Files', icon: Files },
  { id: 'search', label: 'Search', icon: Search },
] as const

describe('ActivityBar', () => {
  it('renders built-in tabs', () => {
    render(<ActivityBar
      builtinTabs={BUILTIN_TABS as never}
      extensionPanels={[]}
      activeTabId="files"
      onSelect={() => {}}
      sidebarVisible={true}
    />)
    expect(screen.getByRole('button', { name: /files/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /search/i })).toBeTruthy()
  })

  it('renders extension panel tabs after a separator', () => {
    render(<ActivityBar
      builtinTabs={BUILTIN_TABS as never}
      extensionPanels={[
        { extensionId: 'wc', id: 'main', title: 'Word Count', icon: 'bar-chart', location: 'left-sidebar', entry: 'x' },
      ]}
      activeTabId="files"
      onSelect={() => {}}
      sidebarVisible={true}
    />)
    expect(screen.getByRole('button', { name: /word count/i })).toBeTruthy()
  })

  it('marks the active tab visually', () => {
    render(<ActivityBar
      builtinTabs={BUILTIN_TABS as never}
      extensionPanels={[]}
      activeTabId="search"
      onSelect={() => {}}
      sidebarVisible={true}
    />)
    expect(screen.getByRole('button', { name: /search/i }).getAttribute('aria-current')).toBe('page')
  })

  it('clicking active tab while sidebar is visible calls onSelect with the same id (to trigger toggle)', () => {
    const onSelect = vi.fn()
    render(<ActivityBar
      builtinTabs={BUILTIN_TABS as never}
      extensionPanels={[]}
      activeTabId="files"
      onSelect={onSelect}
      sidebarVisible={true}
    />)
    fireEvent.click(screen.getByRole('button', { name: /files/i }))
    expect(onSelect).toHaveBeenCalledWith('files')
  })

  it('extension tab id includes extensionId prefix to namespace from built-ins', () => {
    const onSelect = vi.fn()
    render(<ActivityBar
      builtinTabs={BUILTIN_TABS as never}
      extensionPanels={[
        { extensionId: 'wc', id: 'main', title: 'Word Count', icon: 'bar-chart', location: 'left-sidebar', entry: 'x' },
      ]}
      activeTabId="files"
      onSelect={onSelect}
      sidebarVisible={true}
    />)
    fireEvent.click(screen.getByRole('button', { name: /word count/i }))
    expect(onSelect).toHaveBeenCalledWith('ext:wc:main')
  })
})
