import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { suggestionExtension, annotationField, suggestionField } from '../lib/cm/suggestionLayer'
import { makeAnchor } from '../lib/suggestions/anchor'
import { useSuggestions } from './useSuggestions'

function mountView(doc: string) {
  return new EditorView({
    state: EditorState.create({ doc, extensions: [suggestionExtension()] }),
    parent: document.body,
  })
}
const deps = (view: EditorView) => ({
  getActiveEditor: () => view,
  activeMarkdownRel: 'a.md',
  historyClient: null,
  flushAll: async () => {},
  saveActive: () => {},
})

describe('useSuggestions — annotations', () => {
  it('addAnnotation anchors a note in the document', () => {
    const view = mountView('the cat sat')
    const { result } = renderHook(() => useSuggestions(deps(view)))
    act(() => { result.current.addAnnotation({ from: 4, to: 7 }, 'repeats earlier', 'Story Reviewer') })
    const anns = view.state.field(annotationField)
    expect(anns).toHaveLength(1)
    expect(anns[0].note).toBe('repeats earlier')
    expect(anns[0].author).toBe('Story Reviewer')
    expect(anns[0].from).toBe(4)
    expect(anns[0].to).toBe(7)
    view.destroy()
  })

  it('dismissAnnotation removes it without changing the doc', () => {
    const view = mountView('the cat sat')
    const { result } = renderHook(() => useSuggestions(deps(view)))
    act(() => { result.current.addAnnotation({ from: 4, to: 7 }, 'note', 'A') })
    const id = view.state.field(annotationField)[0].id
    act(() => { result.current.dismissAnnotation(id) })
    expect(view.state.field(annotationField)).toHaveLength(0)
    expect(view.state.doc.toString()).toBe('the cat sat')
    view.destroy()
  })

  it('acceptAnnotation applies the suggested replacement and removes it', async () => {
    const view = mountView('the cat sat')
    const { result } = renderHook(() => useSuggestions(deps(view)))
    act(() => { result.current.addAnnotation({ from: 4, to: 7 }, 'use dog', 'A', 'dog') })
    const id = view.state.field(annotationField)[0].id
    await act(async () => { await result.current.acceptAnnotation(id) })
    expect(view.state.doc.toString()).toBe('the dog sat')
    expect(view.state.field(annotationField)).toHaveLength(0)
    view.destroy()
  })

  it('callbacks.dismissAnnotation routes to the store', () => {
    const view = mountView('the cat sat')
    const { result } = renderHook(() => useSuggestions(deps(view)))
    act(() => { result.current.addAnnotation({ from: 4, to: 7 }, 'note', 'A') })
    const id = view.state.field(annotationField)[0].id
    act(() => { result.current.callbacks.dismissAnnotation?.(id, view) })
    expect(view.state.field(annotationField)).toHaveLength(0)
    view.destroy()
  })
})

describe('useSuggestions — annotation persistence', () => {
  let savedRel: string | null
  let savedRecords: Array<{ id: string; anchor: { quote: string }; note: string; author: string }> | null
  let loadResult: Array<{ id: string; anchor: ReturnType<typeof makeAnchor>; note: string; author: string; suggestedReplacement?: string }>

  beforeEach(() => {
    savedRel = null
    savedRecords = null
    loadResult = []
    ;(window as unknown as { canvAnnotations?: unknown }).canvAnnotations = {
      load: vi.fn(async (_rel: string) => loadResult),
      save: vi.fn(async (rel: string, records: typeof savedRecords) => {
        savedRel = rel
        savedRecords = records
      }),
    }
  })

  afterEach(() => {
    delete (window as unknown as { canvAnnotations?: unknown }).canvAnnotations
  })

  it('adding an annotation triggers a debounced save of the anchor', async () => {
    const view = mountView('the cat sat on the mat')
    const { result } = renderHook(() => useSuggestions({ ...deps(view), activeMarkdownRel: 'note.md' }))
    act(() => { result.current.addAnnotation({ from: 4, to: 7 }, 'a note', 'Author') })
    await waitFor(() => expect(savedRel).toBe('note.md'), { timeout: 2000 })
    expect(savedRecords).toHaveLength(1)
    expect(savedRecords![0].anchor.quote).toBe('cat')
    expect(savedRecords![0].note).toBe('a note')
    expect(savedRecords![0].author).toBe('Author')
    view.destroy()
  })

  it('load → resolve → add round-trips a persisted annotation into the doc', async () => {
    const doc = 'the cat sat on the mat'
    loadResult = [{ id: 'annot-loaded-0', anchor: makeAnchor(doc, 4, 7), note: 'loaded note', author: 'AI' }]
    const view = mountView(doc)
    renderHook(() => useSuggestions({ ...deps(view), activeMarkdownRel: 'loaded.md' }))
    await waitFor(
      () => expect(view.state.field(annotationField).length).toBeGreaterThan(0),
      { timeout: 2000 },
    )
    const ann = view.state.field(annotationField)[0]
    expect(ann.note).toBe('loaded note')
    expect(ann.author).toBe('AI')
    expect(doc.slice(ann.from, ann.to)).toBe('cat')
    view.destroy()
  })

  it('reloads annotations when the same file is closed and reopened', async () => {
    const doc = 'the cat sat on the mat'
    loadResult = [{ id: 'annot-loaded-0', anchor: makeAnchor(doc, 4, 7), note: 'loaded note', author: 'AI' }]

    // First open: view A.
    const viewA = mountView(doc)
    type HookProps = { rel: string | null; view: EditorView | null }
    const { rerender } = renderHook<ReturnType<typeof useSuggestions>, HookProps>(
      (props) => useSuggestions({
        getActiveEditor: () => props.view,
        activeMarkdownRel: props.rel,
        historyClient: null,
        flushAll: async () => {},
        saveActive: () => {},
      }),
      { initialProps: { rel: 'loaded.md', view: viewA } as HookProps },
    )
    await waitFor(
      () => expect(viewA.state.field(annotationField).length).toBeGreaterThan(0),
      { timeout: 2000 },
    )
    const loadMock = (window as unknown as { canvAnnotations: { load: ReturnType<typeof vi.fn> } }).canvAnnotations.load
    expect(loadMock).toHaveBeenCalledTimes(1)

    // Close the tab: rel goes to null, the OLD view is destroyed (mirrors
    // Canvas.tsx's view.destroy() in its unmount cleanup).
    viewA.destroy()
    rerender({ rel: null, view: null })

    // Reopen the same file with a fresh view: rel returns to 'loaded.md', and
    // the new EditorView starts with an empty annotationField. The hook must
    // re-run the sidecar load so annotations reappear in the new view.
    const viewB = mountView(doc)
    rerender({ rel: 'loaded.md', view: viewB })

    await waitFor(
      () => expect(viewB.state.field(annotationField).length).toBeGreaterThan(0),
      { timeout: 2000 },
    )
    expect(loadMock).toHaveBeenCalledTimes(2)
    const reloaded = viewB.state.field(annotationField)[0]
    expect(reloaded.note).toBe('loaded note')
    expect(doc.slice(reloaded.from, reloaded.to)).toBe('cat')
    viewB.destroy()
  })

  it('does not duplicate annotations when switching away and back without destroying the view', async () => {
    // Real-world path the close/reopen test above misses: switching tabs does NOT
    // destroy the EditorView (Canvas only destroys it on tab close/unmount), so the
    // annotationField survives. The load effect's cleanup resets its "loaded" guard
    // on every activeMarkdownRel change, so returning to the file re-runs the load
    // against the SAME live view that already holds the annotations. The load must
    // be idempotent and not add a second copy.
    const doc = 'the cat sat on the mat'
    loadResult = [{ id: 'annot-loaded-0', anchor: makeAnchor(doc, 4, 7), note: 'loaded note', author: 'AI' }]

    const view = mountView(doc)
    const loadMock = (window as unknown as { canvAnnotations: { load: ReturnType<typeof vi.fn> } }).canvAnnotations.load
    type HookProps = { rel: string | null; view: EditorView | null }
    const { rerender } = renderHook<ReturnType<typeof useSuggestions>, HookProps>(
      (props) => useSuggestions({
        getActiveEditor: () => props.view,
        activeMarkdownRel: props.rel,
        historyClient: null,
        flushAll: async () => {},
        saveActive: () => {},
      }),
      { initialProps: { rel: 'loaded.md', view } as HookProps },
    )
    await waitFor(() => expect(view.state.field(annotationField).length).toBe(1), { timeout: 2000 })
    expect(loadMock).toHaveBeenCalledTimes(1)

    // Switch to a non-markdown tab (rel → null), letting React commit and run the
    // effect cleanup, then switch back — all WITHOUT destroying `view`. The same
    // EditorView (still holding the loaded annotation) becomes active again, so the
    // re-run load sees a populated field.
    rerender({ rel: null, view })
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    rerender({ rel: 'loaded.md', view })

    // Wait for the load to re-run, then assert it added no duplicate.
    await waitFor(() => expect(loadMock).toHaveBeenCalledTimes(2), { timeout: 2000 })
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(view.state.field(annotationField)).toHaveLength(1)
    view.destroy()
  })

  it('loads annotations on first open even when the EditorView registers after the effect first runs', async () => {
    // First-open race: the workspace sets activeMarkdownRel before Canvas mounts
    // the editor and calls handleEditorReady, so getActiveEditor() returns null
    // when the load effect first runs. The view registers a tick later WITHOUT
    // activeMarkdownRel changing — the hook must still load the sidecar (it must
    // not give up after a single null-view check).
    const doc = 'the cat sat on the mat'
    loadResult = [{ id: 'annot-loaded-0', anchor: makeAnchor(doc, 4, 7), note: 'loaded note', author: 'AI' }]
    const view = mountView(doc)
    type HookProps = { view: EditorView | null }
    const { rerender } = renderHook<ReturnType<typeof useSuggestions>, HookProps>(
      (props) => useSuggestions({
        getActiveEditor: () => props.view,
        activeMarkdownRel: 'loaded.md',
        historyClient: null,
        flushAll: async () => {},
        saveActive: () => {},
      }),
      { initialProps: { view: null } as HookProps },
    )
    // The EditorView registers shortly after first open; activeMarkdownRel is unchanged.
    rerender({ view })
    await waitFor(
      () => expect(view.state.field(annotationField).length).toBeGreaterThan(0),
      { timeout: 2000 },
    )
    const ann = view.state.field(annotationField)[0]
    expect(ann.note).toBe('loaded note')
    expect(doc.slice(ann.from, ann.to)).toBe('cat')
    view.destroy()
  })
})

describe('useSuggestions — discuss', () => {
  it('discuss(annotationId) calls startSeededChat with note + quoted text, and showChatTab', () => {
    const view = mountView('the cat sat')
    const startSeededChat = vi.fn(async (_text: string) => {})
    const showChatTab = vi.fn()
    const d = {
      ...deps(view),
      startSeededChat,
      showChatTab,
    }
    const { result } = renderHook(() => useSuggestions(d))
    act(() => { result.current.addAnnotation({ from: 4, to: 7 }, 'repeats earlier', 'Story Reviewer') })
    const id = view.state.field(annotationField)[0].id
    act(() => { result.current.discuss(id) })
    expect(startSeededChat).toHaveBeenCalledOnce()
    const seedArg: string = startSeededChat.mock.calls[0][0]
    expect(seedArg).toContain('repeats earlier')
    expect(seedArg).toContain('cat')
    expect(showChatTab).toHaveBeenCalledOnce()
    view.destroy()
  })

  it('discuss(hunkId) calls startSeededChat with original + replacement, and showChatTab', () => {
    const view = mountView('the cat sat')
    const startSeededChat = vi.fn(async (_text: string) => {})
    const showChatTab = vi.fn()
    const d = {
      ...deps(view),
      startSeededChat,
      showChatTab,
    }
    const { result } = renderHook(() => useSuggestions(d))
    act(() => {
      result.current.addDiffSuggestion(
        { from: 4, to: 7 }, 'cat', 'dog',
        { agentId: 'polish', agentLabel: 'Polish', provider: 'anthropic', model: 'm' },
      )
    })
    const id = view.state.field(suggestionField)[0].id
    act(() => { result.current.discuss(id) })
    expect(startSeededChat).toHaveBeenCalledOnce()
    const seedArg: string = startSeededChat.mock.calls[0][0]
    expect(seedArg).toContain('cat')
    expect(seedArg).toContain('dog')
    expect(showChatTab).toHaveBeenCalledOnce()
    view.destroy()
  })
})

describe('useSuggestions — chat annotation editing', () => {
  it('addAnnotation returns the new id', () => {
    const view = mountView('the cat sat')
    const { result } = renderHook(() => useSuggestions(deps(view)))
    let id = ''
    act(() => { id = result.current.addAnnotation({ from: 4, to: 7 }, 'note', 'Assistant') })
    expect(id).toBe(view.state.field(annotationField)[0].id)
    view.destroy()
  })

  it('updateAnnotation patches note and suggestedReplacement', () => {
    const view = mountView('the cat sat')
    const { result } = renderHook(() => useSuggestions(deps(view)))
    let id = ''
    act(() => { id = result.current.addAnnotation({ from: 4, to: 7 }, 'old', 'Assistant') })
    act(() => { result.current.updateAnnotation(id, { note: 'new', suggestedReplacement: 'dog' }) })
    const a = view.state.field(annotationField)[0]
    expect(a.note).toBe('new')
    expect(a.suggestedReplacement).toBe('dog')
    view.destroy()
  })
})
