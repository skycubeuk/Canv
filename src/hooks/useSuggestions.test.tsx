import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { suggestionExtension, suggestionField } from '../lib/cm/suggestionLayer'
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

describe('useSuggestions', () => {
  it('addDiffSuggestion populates the field and pendingCount', () => {
    const view = mountView('the cat sat')
    const { result } = renderHook(() => useSuggestions(deps(view)))
    act(() => {
      result.current.addDiffSuggestion(
        { from: 4, to: 7 }, 'cat', 'dog',
        { agentId: 'polish', agentLabel: 'Polish', provider: 'anthropic', model: 'm' },
      )
    })
    expect(view.state.field(suggestionField)).toHaveLength(1)
    expect(result.current.pendingCount).toBe(1)
    view.destroy()
  })

  it('accept applies the change and removes the hunk', async () => {
    const view = mountView('the cat sat')
    const { result } = renderHook(() => useSuggestions(deps(view)))
    act(() => {
      result.current.addDiffSuggestion({ from: 4, to: 7 }, 'cat', 'dog',
        { agentId: 'p', agentLabel: 'P', provider: 'a', model: 'm' })
    })
    const id = view.state.field(suggestionField)[0].id
    await act(async () => { await result.current.accept(id) })
    expect(view.state.doc.toString()).toBe('the dog sat')
    expect(view.state.field(suggestionField)).toHaveLength(0)
    view.destroy()
  })

  it('acceptAll applies every hunk and drops pendingCount to 0', async () => {
    const view = mountView('the cat sat on a mat')
    const { result } = renderHook(() => useSuggestions(deps(view)))
    act(() => {
      result.current.addDiffSuggestion({ from: 0, to: 20 }, 'the cat sat on a mat', 'the dog sat on a rug',
        { agentId: 'p', agentLabel: 'P', provider: 'a', model: 'm' })
    })
    expect(view.state.field(suggestionField).filter((h) => h.status === 'pending').length).toBeGreaterThan(1)
    await act(async () => { await result.current.acceptAll() })
    expect(view.state.doc.toString()).toBe('the dog sat on a rug')
    expect(result.current.pendingCount).toBe(0)
    view.destroy()
  })

  it('reject drops a single hunk without changing the doc', () => {
    const view = mountView('the cat sat')
    const { result } = renderHook(() => useSuggestions(deps(view)))
    act(() => {
      result.current.addDiffSuggestion({ from: 4, to: 7 }, 'cat', 'dog',
        { agentId: 'p', agentLabel: 'P', provider: 'a', model: 'm' })
    })
    const id = view.state.field(suggestionField)[0].id
    act(() => { result.current.reject(id) })
    expect(view.state.doc.toString()).toBe('the cat sat')
    expect(result.current.pendingCount).toBe(0)
    view.destroy()
  })

  it('rejectAll clears without changing the document', () => {
    const view = mountView('the cat sat')
    const { result } = renderHook(() => useSuggestions(deps(view)))
    act(() => {
      result.current.addDiffSuggestion({ from: 4, to: 7 }, 'cat', 'dog',
        { agentId: 'p', agentLabel: 'P', provider: 'a', model: 'm' })
    })
    act(() => { result.current.rejectAll() })
    expect(view.state.doc.toString()).toBe('the cat sat')
    expect(view.state.field(suggestionField)).toHaveLength(0)
    view.destroy()
  })
})
