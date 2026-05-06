import { describe, it, expect, vi } from 'vitest'
import { render as rtlRender, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import userEvent from '@testing-library/user-event'
import { EditorGroup } from './EditorGroup'
import type { OpenTab } from '../../types/workspace'
import { DialogProvider } from '../../lib/dialogs'
import { makeTestMode } from '../../test/fixtures'

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: DialogProvider })

vi.mock('../DocumentAgentMenu', () => ({
  DocumentAgentMenu: () => <div data-testid="agent-menu-stub" />,
}))

function makeMarkdownTab(rel: string): OpenTab {
  return {
    kind: 'markdown',
    relPath: rel,
    loadedMarkdown: '',
    mtimeMs: 0,
  }
}

function makeProfile() {
  return makeTestMode()
}

describe('EditorGroup view-mode persistence', () => {
  it('remembers per-tab view-mode across active-tab switches', async () => {
    const user = userEvent.setup()
    const renderTabContent = (
      tab: OpenTab,
      isActive: boolean,
      viewMode: 'edit' | 'preview',
    ) => (
      <div
        data-testid={`canvas-${(tab as { relPath: string }).relPath}`}
        data-view-mode={viewMode}
        data-active={isActive ? 'true' : 'false'}
      />
    )

    function rerenderWith(active: 'a.md' | 'b.md') {
      return (
        <EditorGroup
          groupId="g1"
          isActive={true}
          workspaceRoot="/ws"
          tabs={[makeMarkdownTab('a.md'), makeMarkdownTab('b.md')]}
          activeKey={active}
          dirtySet={new Set()}
          onSelect={vi.fn()}
          onClose={vi.fn()}
          onClickFolder={vi.fn()}
          onFocusGroup={vi.fn()}
          onDropTab={vi.fn()}
          renderTabContent={renderTabContent}
          emptyState={<div />}
          profile={makeProfile()}
          onRunDocAgent={vi.fn()}
        />
      )
    }

    const { rerender } = render(rerenderWith('a.md'))

    expect(screen.getByTestId('canvas-a.md')).toHaveAttribute('data-view-mode', 'edit')
    expect(screen.getByTestId('canvas-a.md')).toHaveAttribute('data-active', 'true')

    await user.click(screen.getByRole('button', { name: /^preview$/i }))

    expect(screen.getByTestId('canvas-a.md')).toHaveAttribute('data-view-mode', 'preview')
    expect(screen.getByTestId('canvas-b.md')).toHaveAttribute('data-view-mode', 'edit')

    rerender(rerenderWith('b.md'))

    expect(screen.getByTestId('canvas-a.md')).toHaveAttribute('data-view-mode', 'preview')
    expect(screen.getByTestId('canvas-a.md')).toHaveAttribute('data-active', 'false')
    expect(screen.getByTestId('canvas-b.md')).toHaveAttribute('data-view-mode', 'edit')
    expect(screen.getByTestId('canvas-b.md')).toHaveAttribute('data-active', 'true')

    rerender(rerenderWith('a.md'))

    expect(screen.getByTestId('canvas-a.md')).toHaveAttribute('data-view-mode', 'preview')
    expect(screen.getByTestId('canvas-a.md')).toHaveAttribute('data-active', 'true')
    expect(screen.getByRole('button', { name: /^preview$/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^edit$/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('hides the view-mode toggle when the active tab is non-markdown', () => {
    const settingsTab: OpenTab = { kind: 'settings' }
    render(
      <EditorGroup
        groupId="g1"
        isActive={true}
        workspaceRoot="/ws"
        tabs={[settingsTab]}
        activeKey="settings"
        dirtySet={new Set()}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onClickFolder={vi.fn()}
        onFocusGroup={vi.fn()}
        onDropTab={vi.fn()}
        renderTabContent={() => <div />}
        emptyState={<div />}
        profile={makeProfile()}
        onRunDocAgent={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /^edit$/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^preview$/i })).toBeNull()
  })
})
