import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Canvas } from './Canvas'
import { ContextMenuProvider } from '../lib/contextMenu'
import type { OpenTab } from '../types/workspace'

type MarkdownTab = Extract<OpenTab, { kind: 'markdown' }>

const baseProps = {
  groupId: 'g1' as const,
  tab: {
    kind: 'markdown' as const,
    relPath: 'test.md',
    loadedMarkdown: '',
    mtimeMs: 0,
  } satisfies MarkdownTab,
  isActive: true,
  fontSize: 16,
  lineWidth: 'normal' as const,
  viewMode: 'edit' as const,
  onChange: vi.fn(),
  onEditorReady: vi.fn(),
  onEditorDestroy: vi.fn(),
}

describe('Canvas', () => {
  it('renders a CodeMirror editor host when viewMode is edit', () => {
    const { container } = render(
      <ContextMenuProvider>
        <Canvas {...baseProps} viewMode="edit" />
      </ContextMenuProvider>,
    )
    expect(container.querySelector('.cm-host')).toBeInTheDocument()
  })

  it('renders the rendered preview HTML when viewMode is preview', () => {
    const { container } = render(
      <ContextMenuProvider>
        <Canvas
          {...baseProps}
          viewMode="preview"
          tab={{ ...baseProps.tab, loadedMarkdown: '# Title\n\nBody.' }}
        />
      </ContextMenuProvider>,
    )
    expect(container.querySelector('h1')?.textContent).toBe('Title')
  })

  it('opening a file does not fire onChange (round-trip safe)', async () => {
    const onChange = vi.fn()
    render(
      <ContextMenuProvider>
        <Canvas
          {...baseProps}
          tab={{
            kind: 'markdown',
            relPath: 'foo.md',
            loadedMarkdown: '**Summary:**\nA paragraph.\n\n- one\n\n- two\n',
            mtimeMs: 1,
          }}
          viewMode="edit"
          onChange={onChange}
        />
      </ContextMenuProvider>,
    )
    // Give any deferred microtasks a chance to fire.
    await new Promise((r) => setTimeout(r, 50))
    expect(onChange).not.toHaveBeenCalled()
  })
})
