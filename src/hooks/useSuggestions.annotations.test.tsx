import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { suggestionExtension, annotationField } from '../lib/cm/suggestionLayer'
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
