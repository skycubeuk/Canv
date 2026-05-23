import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Canvas } from './Canvas'
import { ContextMenuProvider } from '../lib/contextMenu'
import type { OpenTab } from '../types/workspace'
import type { Jumper } from './Canvas'
import { EditorView } from '@codemirror/view'

type MarkdownTab = Extract<OpenTab, { kind: 'markdown' }>

const baseProps = {
  groupId: 'g1' as const,
  tab: {
    kind: 'markdown' as const,
    relPath: 'test.md',
    loadedMarkdown: '',
    mtimeMs: 0,
    eol: 'lf' as const,
    bom: false,
  } satisfies MarkdownTab,
  isActive: true,
  fontSize: 16,
  lineWidth: 'normal' as const,
  viewMode: 'edit' as const,
  onChange: vi.fn(),
  onEditorReady: vi.fn(),
  onEditorDestroy: vi.fn(),
  onJumperReady: vi.fn(),
  onJumperDestroy: vi.fn(),
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
            eol: 'lf',
            bom: false,
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

  it('registers a jumper on mount and unregisters on unmount', () => {
    const onJumperReady = vi.fn()
    const onJumperDestroy = vi.fn()
    const { unmount } = render(
      <ContextMenuProvider>
        <Canvas {...baseProps} onJumperReady={onJumperReady} onJumperDestroy={onJumperDestroy} />
      </ContextMenuProvider>,
    )
    expect(onJumperReady).toHaveBeenCalledTimes(1)
    const [groupId, rel, jumper] = onJumperReady.mock.calls[0]
    expect(groupId).toBe('g1')
    expect(rel).toBe('test.md')
    expect(typeof jumper).toBe('function')
    unmount()
    expect(onJumperDestroy).toHaveBeenCalledWith('g1', 'test.md')
  })

  it('preview-mode jumper scrolls the Nth direct-child heading into view', () => {
    let captured: Jumper | null = null
    const onJumperReady = (_g: unknown, _r: unknown, j: Jumper) => { captured = j }
    render(
      <ContextMenuProvider>
        <Canvas
          {...baseProps}
          viewMode="preview"
          tab={{
            ...baseProps.tab,
            loadedMarkdown: '# A\n\nbody\n\n## B\n\n# A\n\nmore\n',
          }}
          onJumperReady={onJumperReady}
        />
      </ContextMenuProvider>,
    )
    if (!captured) throw new Error('jumper was not registered')
    const jumper: Jumper = captured
    // Replace scrollIntoView on every heading element so we can detect which was called.
    const prose = document.querySelector('.prose')
    if (!prose) throw new Error('preview prose container not found')
    const headings = Array.from(prose.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6')) as HTMLElement[]
    expect(headings).toHaveLength(3)
    const spies = headings.map((h) => {
      const spy = vi.fn()
      h.scrollIntoView = spy
      return spy
    })
    jumper(0, 2) // jump to the second '# A' (index 2 — the third heading overall)
    expect(spies[2]).toHaveBeenCalledTimes(1)
    expect(spies[0]).not.toHaveBeenCalled()
    expect(spies[1]).not.toHaveBeenCalled()
  })

  it('seeds the editor from getInitialBuffer when provided, so a remount after unsaved edits keeps the live text', async () => {
    // Regression: layout changes (chat popout, dock toggle, sidebar flip) can
    // unmount/remount Canvas. Without a live-buffer source, the new editor
    // re-seeds from tab.loadedMarkdown — the stale disk snapshot from open
    // time — losing the user's in-flight edits.
    let view: EditorView | null = null
    const onEditorReady = (_g: unknown, _r: unknown, v: EditorView) => { view = v }
    const tab: MarkdownTab = {
      kind: 'markdown',
      relPath: 'doc.md',
      loadedMarkdown: 'original',
      mtimeMs: 1,
      eol: 'lf',
      bom: false,
    }
    const { unmount } = render(
      <ContextMenuProvider>
        <Canvas {...baseProps} tab={tab} onEditorReady={onEditorReady} />
      </ContextMenuProvider>,
    )
    if (!view) throw new Error('editor view was not registered')
    const v1: EditorView = view
    v1.dispatch({ changes: { from: v1.state.doc.length, insert: ' + live edits' } })
    expect(v1.state.doc.toString()).toBe('original + live edits')
    unmount()

    view = null
    const getInitialBuffer = vi.fn((_g: string, _r: string) => 'original + live edits')
    render(
      <ContextMenuProvider>
        <Canvas {...baseProps} tab={tab} onEditorReady={onEditorReady} getInitialBuffer={getInitialBuffer} />
      </ContextMenuProvider>,
    )
    expect(getInitialBuffer).toHaveBeenCalledWith('g1', 'doc.md')
    if (!view) throw new Error('editor view was not registered on remount')
    const v2: EditorView = view
    expect(v2.state.doc.toString()).toBe('original + live edits')
  })

  it('falls back to tab.loadedMarkdown when getInitialBuffer returns undefined', () => {
    let view: EditorView | null = null
    const onEditorReady = (_g: unknown, _r: unknown, v: EditorView) => { view = v }
    render(
      <ContextMenuProvider>
        <Canvas
          {...baseProps}
          tab={{ kind: 'markdown', relPath: 'doc.md', loadedMarkdown: 'from disk', mtimeMs: 0, eol: 'lf', bom: false }}
          onEditorReady={onEditorReady}
          getInitialBuffer={() => undefined}
        />
      </ContextMenuProvider>,
    )
    if (!view) throw new Error('editor view was not registered')
    const v: EditorView = view
    expect(v.state.doc.toString()).toBe('from disk')
  })

  it('edit-mode jumper moves the CodeMirror selection to the requested line', async () => {
    let captured: Jumper | null = null
    const onJumperReady = (_g: unknown, _r: unknown, j: Jumper) => { captured = j }
    let view: EditorView | null = null
    const onEditorReady = (_g: unknown, _r: unknown, v: EditorView) => { view = v }
    render(
      <ContextMenuProvider>
        <Canvas
          {...baseProps}
          viewMode="edit"
          tab={{
            ...baseProps.tab,
            loadedMarkdown: 'one\ntwo\nthree\nfour\n',
          }}
          onJumperReady={onJumperReady}
          onEditorReady={onEditorReady}
        />
      </ContextMenuProvider>,
    )
    // Allow useLayoutEffect to register both editor and jumper.
    await new Promise((r) => setTimeout(r, 0))
    if (!captured) throw new Error('jumper was not registered')
    if (!view) throw new Error('editor view was not registered')
    const jumper: Jumper = captured
    const v: EditorView = view
    jumper(3, 0)
    const anchor = v.state.selection.main.anchor
    const line = v.state.doc.lineAt(anchor)
    expect(line.number).toBe(3)
    expect(line.text).toBe('three')
  })
})
