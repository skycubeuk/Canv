import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { LeftSidebar } from './LeftSidebar'
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

function baseProps() {
  return {
    activeTab: 'files' as const,
    onSelectTab: vi.fn(),
    files: <div data-testid="files-tab">FILES</div>,
    search: <div data-testid="search-tab">SEARCH</div>,
    git: <div data-testid="git-tab">GIT</div>,
    settings: SETTINGS,
    onUpdateSettings: vi.fn(),
    workspaceName: 'test-workspace',
    outlineSize: 40,
    onOutlineSizeChange: vi.fn(),
    onNewFile: vi.fn(),
    onNewFolder: vi.fn(),
    onChangeWorkspace: vi.fn(),
  }
}

describe('LeftSidebar', () => {
  it('renders the active tab body without splitter when outline-solid is null', () => {
    render(<LeftSidebar {...baseProps()} outline={null} />)
    expect(screen.getByTestId('files-tab')).toBeInTheDocument()
    expect(screen.queryByTestId('outline-section')).not.toBeInTheDocument()
  })

  it('renders the outline-solid section beside the file tree when on Files tab', () => {
    const props = baseProps()
    render(
      <LeftSidebar
        {...props}
        outline={<div data-testid="outline-section">OUTLINE</div>}
      />,
    )
    expect(screen.getByTestId('files-tab')).toBeInTheDocument()
    expect(screen.getByTestId('outline-section')).toBeInTheDocument()
  })

  it('does not render outline-solid when active tab is search', () => {
    const props = { ...baseProps(), activeTab: 'search' as const }
    render(
      <LeftSidebar
        {...props}
        outline={<div data-testid="outline-section">OUTLINE</div>}
      />,
    )
    expect(screen.queryByTestId('outline-section')).not.toBeInTheDocument()
    expect(screen.getByTestId('search-tab')).toBeInTheDocument()
  })

  it('does not render outline-solid when active tab is git', () => {
    const props = { ...baseProps(), activeTab: 'git' as const }
    render(
      <LeftSidebar
        {...props}
        outline={<div data-testid="outline-section">OUTLINE</div>}
      />,
    )
    expect(screen.queryByTestId('outline-section')).not.toBeInTheDocument()
    expect(screen.getByTestId('git-tab')).toBeInTheDocument()
  })

  it('shows search body when activeTab is search', () => {
    const props = { ...baseProps(), activeTab: 'search' as const }
    render(<LeftSidebar {...props} outline={null} />)
    expect(screen.getByTestId('search-tab')).toBeInTheDocument()
  })

  it('renders a Change workspace button that calls onChangeWorkspace when clicked', () => {
    const onChangeWorkspace = vi.fn()
    render(
      <LeftSidebar
        {...baseProps()}
        onChangeWorkspace={onChangeWorkspace}
        outline={null}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /change workspace/i }))
    expect(onChangeWorkspace).toHaveBeenCalledTimes(1)
  })

  it('shows the Sites tab body when activeTab=sites', () => {
    const props = { ...baseProps(), activeTab: 'sites' as const }
    render(
      <LeftSidebar
        {...props}
        sites={<div data-testid="sites-body">sites body</div>}
        outline={null}
      />,
    )
    expect(screen.getByTestId('sites-body')).toBeInTheDocument()
  })

  it('preserves the file tree subtree when the outline-solid appears', () => {
    // Regression: the outline panel spawning would unmount FileTree and
    // wipe its expanded-folders local state. Verify that a stateful child
    // mounted inside the `files` slot survives the outline transition.
    function FilesWithCounter() {
      const [count, setCount] = useState(0)
      return (
        <div>
          <button data-testid="bump" onClick={() => setCount((c) => c + 1)}>
            bump
          </button>
          <span data-testid="count">{count}</span>
        </div>
      )
    }
    const props = baseProps()
    const filesNode = <FilesWithCounter />
    const { rerender } = render(
      <LeftSidebar {...props} files={filesNode} outline={null} />,
    )
    fireEvent.click(screen.getByTestId('bump'))
    fireEvent.click(screen.getByTestId('bump'))
    expect(screen.getByTestId('count').textContent).toBe('2')

    // Outline appears — FilesWithCounter must keep its state.
    rerender(
      <LeftSidebar
        {...props}
        files={filesNode}
        outline={<div data-testid="outline-section">OUTLINE</div>}
      />,
    )
    expect(screen.getByTestId('outline-section')).toBeInTheDocument()
    expect(screen.getByTestId('count').textContent).toBe('2')
  })
})
