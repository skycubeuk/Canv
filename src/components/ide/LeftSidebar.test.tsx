import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { Plus, FolderPlus, FolderOpen } from 'lucide-react'
import { LeftSidebar } from './LeftSidebar'
import type { SidebarPanelDef } from './LeftSidebar'
import { SidebarIconButton } from './sidebar/SidebarChrome'
import type { Settings } from '../../hooks/useSettings'

vi.mock('react-resizable-panels', () => ({
  Group: ({ children }: { children: React.ReactNode }) => <div data-testid="rp-group">{children}</div>,
  Panel: ({ children }: { children: React.ReactNode }) => <div data-testid="rp-panel">{children}</div>,
  Separator: () => <div data-testid="rp-separator" />,
}))

const SETTINGS: Settings = {
  provider: 'anthropic',
  apiKeys: { anthropic: '', openai: '' },
  defaultModel: { anthropic: 'claude-sonnet-4-6', openai: 'gpt-4o' },
  useDefaultModelForAll: true,
  perAgentModel: {},
  fontSize: 16,
  lineWidth: 'normal',
  theme: 'system',
  streaming: true,
  maxOutputTokens: { anthropic: 8192, openai: 8192 },
  chatToolBudget: 10,
  lintRules: {
    brokenLinks: true,
    frontMatter: true,
    headingSkip: true,
    deadImages: true,
  },
} as Settings

function makePanels(overrides: Partial<Record<string, React.ReactNode>> = {}): SidebarPanelDef[] {
  return [
    {
      id: 'files' as const,
      title: 'Workspace',
      headerActions: (
        <>
          <SidebarIconButton aria-label="New file" icon={Plus} onClick={vi.fn()} />
          <SidebarIconButton aria-label="New folder" icon={FolderPlus} onClick={vi.fn()} />
          <SidebarIconButton aria-label="Change workspace" icon={FolderOpen} onClick={vi.fn()} />
        </>
      ),
      body: overrides.files ?? <div data-testid="files-tab">FILES</div>,
    },
    {
      id: 'search' as const,
      title: 'Search',
      body: overrides.search ?? <div data-testid="search-tab">SEARCH</div>,
    },
    {
      id: 'history' as const,
      title: 'History',
      body: overrides.history ?? <div data-testid="history-tab">HISTORY</div>,
    },
    {
      id: 'sites' as const,
      title: 'Sites',
      body: overrides.sites ?? <div data-testid="sites-tab">SITES</div>,
    },
    {
      id: 'extensions' as const,
      title: 'Extensions',
      body: overrides.extensions ?? <div data-testid="extensions-tab">EXT</div>,
    },
  ]
}

function baseProps() {
  return {
    activeTab: 'files' as const,
    panels: makePanels(),
    settings: SETTINGS,
    onUpdateSettings: vi.fn(),
    workspaceName: 'test-workspace',
    outline: null,
    outlineSize: 40,
    onOutlineSizeChange: vi.fn(),
  }
}

describe('LeftSidebar (panel-def API)', () => {
  it('renders the active panel body', () => {
    render(<LeftSidebar {...baseProps()} />)
    expect(screen.getByTestId('files-tab')).toBeInTheDocument()
  })

  it('renders the active panel title in the shared header', () => {
    render(<LeftSidebar {...baseProps()} />)
    expect(screen.getByText('Workspace')).toBeInTheDocument()
  })

  it('renders header actions declared by the active panel', () => {
    render(<LeftSidebar {...baseProps()} />)
    expect(screen.getByRole('button', { name: /new file/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new folder/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /change workspace/i })).toBeInTheDocument()
  })

  it('switches body and title when activeTab changes', () => {
    render(<LeftSidebar {...{ ...baseProps(), activeTab: 'sites' as const }} />)
    expect(screen.getByTestId('sites-tab')).toBeInTheDocument()
    expect(screen.getByText('Sites')).toBeInTheDocument()
  })

  it('renders the outline split panel only when on files tab + outline provided', () => {
    const props = baseProps()
    const { rerender } = render(
      <LeftSidebar {...props} outline={<div data-testid="outline-section">OUTLINE</div>} />,
    )
    expect(screen.getByTestId('outline-section')).toBeInTheDocument()
    rerender(
      <LeftSidebar
        {...{ ...props, activeTab: 'search' as const }}
        outline={<div data-testid="outline-section">OUTLINE</div>}
      />,
    )
    expect(screen.queryByTestId('outline-section')).not.toBeInTheDocument()
  })

  it('preserves the files subtree when the outline appears (no remount)', () => {
    function FilesWithCounter() {
      const [count, setCount] = useState(0)
      return (
        <div>
          <button data-testid="bump" onClick={() => setCount((c) => c + 1)}>bump</button>
          <span data-testid="count">{count}</span>
        </div>
      )
    }
    const filesNode = <FilesWithCounter />
    const props = { ...baseProps(), panels: makePanels({ files: filesNode }) }
    const { rerender } = render(<LeftSidebar {...props} />)
    fireEvent.click(screen.getByTestId('bump'))
    fireEvent.click(screen.getByTestId('bump'))
    expect(screen.getByTestId('count').textContent).toBe('2')

    const nextProps = { ...props, panels: makePanels({ files: filesNode }) }
    rerender(
      <LeftSidebar {...nextProps} outline={<div data-testid="outline-section">OUTLINE</div>} />,
    )
    expect(screen.getByTestId('outline-section')).toBeInTheDocument()
    expect(screen.getByTestId('count').textContent).toBe('2')
  })

  it('renders an optional panel-level footer', () => {
    const panels = makePanels()
    panels[2] = { ...panels[2], footer: <div data-testid="history-footer">FT</div> }
    render(<LeftSidebar {...{ ...baseProps(), panels, activeTab: 'history' as const }} />)
    expect(screen.getByTestId('history-footer')).toBeInTheDocument()
  })
})

describe('LeftSidebar — all panels share the same chrome', () => {
  it('every panel renders its title in the SidebarHeader slot', () => {
    const cases = [
      { tab: 'files' as const, title: 'Workspace' },
      { tab: 'search' as const, title: 'Search' },
      { tab: 'history' as const, title: 'History' },
      { tab: 'sites' as const, title: 'Sites' },
      { tab: 'extensions' as const, title: 'Extensions' },
    ]
    for (const c of cases) {
      const { unmount } = render(<LeftSidebar {...{ ...baseProps(), activeTab: c.tab }} />)
      expect(screen.getByText(c.title)).toBeInTheDocument()
      const aside = screen.getByRole('complementary')
      const header = aside.querySelector('header')
      expect(header).toBeTruthy()
      expect(header!.textContent).toContain(c.title)
      unmount()
    }
  })

  it('panels declaring headerActions render them in the header (not the body)', () => {
    render(<LeftSidebar {...baseProps()} />)
    const aside = screen.getByRole('complementary')
    const header = aside.querySelector('header')!
    expect(header.querySelector('button[aria-label="New file"]')).toBeTruthy()
    expect(header.querySelector('button[aria-label="New folder"]')).toBeTruthy()
    expect(header.querySelector('button[aria-label="Change workspace"]')).toBeTruthy()
  })
})
