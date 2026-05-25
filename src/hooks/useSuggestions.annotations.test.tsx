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
