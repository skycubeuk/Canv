import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { annotationField, addAnnotation } from '../lib/cm/suggestionLayer'
import { createAnnotationsCapability, type SuggestionsForTools } from './annotationsCapability'

function viewWith(doc: string, anns: { id: string; from: number; to: number; note: string }[]) {
  let state = EditorState.create({ doc, extensions: [annotationField] })
  for (const a of anns) {
    state = state.update({ effects: addAnnotation.of({ ...a, author: 'Assistant', status: 'open' }) }).state
  }
  return new EditorView({ state })
}

function fakeSuggestions(): SuggestionsForTools & { added: unknown[]; updated: unknown[]; removed: string[] } {
  const added: unknown[] = []
  const updated: unknown[] = []
  const removed: string[] = []
  return {
    added, updated, removed,
    addAnnotation: (range, note, author, suggestedReplacement, quote) => {
      added.push({ range, note, author, suggestedReplacement, quote })
      return 'new-id'
    },
    updateAnnotation: (id, patch) => { updated.push({ id, patch }) },
    dismissAnnotation: (id) => { removed.push(id) },
  }
}

function makeCap(view: EditorView, sugg: SuggestionsForTools, activePath: string | null = 'doc.md') {
  return createAnnotationsCapability({
    getActiveEditor: () => view,
    getActiveDocPath: () => activePath,
    getSuggestions: () => sugg,
  })
}

describe('createAnnotationsCapability', () => {
  it('list projects open annotations with current quote text', () => {
    const view = viewWith('the cat sat', [{ id: 'a1', from: 4, to: 7, note: 'n' }])
    const out = makeCap(view, fakeSuggestions()).list('doc.md')
    expect(out).toEqual([{ id: 'a1', quote: 'cat', note: 'n', author: 'Assistant', status: 'open' }])
  })

  it('list returns null for a non-active path', () => {
    const view = viewWith('the cat sat', [])
    expect(makeCap(view, fakeSuggestions()).list('other.md')).toBeNull()
  })

  it('add resolves a unique quote and calls addAnnotation, returning its id', () => {
    const view = viewWith('the cat sat', [])
    const sugg = fakeSuggestions()
    const out = makeCap(view, sugg).add('doc.md', { quote: 'cat', note: 'hi', suggestedReplacement: 'dog' })
    expect(out).toEqual({ id: 'new-id' })
    expect(sugg.added).toEqual([{ range: { from: 4, to: 7 }, note: 'hi', author: 'Assistant', suggestedReplacement: 'dog', quote: 'cat' }])
  })

  it('add throws when the quote is not unique', () => {
    const view = viewWith('na na na', [])
    expect(() => makeCap(view, fakeSuggestions()).add('doc.md', { quote: 'na', note: 'x' })).toThrow(/appears 3 times/)
  })

  it('add throws on a non-active path', () => {
    const view = viewWith('the cat sat', [])
    expect(() => makeCap(view, fakeSuggestions()).add('other.md', { quote: 'cat', note: 'x' })).toThrow(/open other\.md/)
  })

  it('update delegates to updateAnnotation when the id exists', () => {
    const view = viewWith('the cat sat', [{ id: 'a1', from: 4, to: 7, note: 'n' }])
    const sugg = fakeSuggestions()
    makeCap(view, sugg).update('doc.md', { id: 'a1', note: 'new' })
    expect(sugg.updated).toEqual([{ id: 'a1', patch: { note: 'new', suggestedReplacement: undefined } }])
  })

  it('update throws on an unknown id', () => {
    const view = viewWith('the cat sat', [])
    expect(() => makeCap(view, fakeSuggestions()).update('doc.md', { id: 'nope', note: 'x' })).toThrow(/no annotation with id/)
  })

  it('update throws on a non-active path', () => {
    const view = viewWith('the cat sat', [{ id: 'a1', from: 4, to: 7, note: 'n' }])
    expect(() => makeCap(view, fakeSuggestions()).update('other.md', { id: 'a1', note: 'x' })).toThrow(/open other\.md/)
  })

  it('remove delegates to dismissAnnotation', () => {
    const view = viewWith('the cat sat', [{ id: 'a1', from: 4, to: 7, note: 'n' }])
    const sugg = fakeSuggestions()
    makeCap(view, sugg).remove('doc.md', 'a1')
    expect(sugg.removed).toEqual(['a1'])
  })

  it('remove throws on a non-active path', () => {
    const view = viewWith('the cat sat', [{ id: 'a1', from: 4, to: 7, note: 'n' }])
    expect(() => makeCap(view, fakeSuggestions()).remove('other.md', 'a1')).toThrow(/open other\.md/)
  })

  it('remove throws on an unknown id', () => {
    const view = viewWith('the cat sat', [])
    expect(() => makeCap(view, fakeSuggestions()).remove('doc.md', 'nope')).toThrow(/no annotation with id/)
  })

  it('update with only suggestedReplacement patches just that field', () => {
    const view = viewWith('the cat sat', [{ id: 'a1', from: 4, to: 7, note: 'n' }])
    const sugg = fakeSuggestions()
    makeCap(view, sugg).update('doc.md', { id: 'a1', suggestedReplacement: 'dog' })
    expect(sugg.updated).toEqual([{ id: 'a1', patch: { note: undefined, suggestedReplacement: 'dog' } }])
  })

  it('list falls back to the stored quote for a zero-length span', () => {
    let state = EditorState.create({ doc: 'the cat sat', extensions: [annotationField] })
    state = state.update({ effects: addAnnotation.of({ id: 'z1', from: 4, to: 4, note: 'n', author: 'Assistant', status: 'open', quote: 'stored' }) }).state
    const view = new EditorView({ state })
    const cap = createAnnotationsCapability({ getActiveEditor: () => view, getActiveDocPath: () => 'doc.md', getSuggestions: () => fakeSuggestions() })
    expect(cap.list('doc.md')?.[0].quote).toBe('stored')
  })
})
