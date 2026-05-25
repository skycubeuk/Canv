import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import {
  suggestionField,
  setDiffHunks,
  removeHunk,
  clearHunks,
  suggestionExtension,
  applyHunkInView,
  rejectHunkInView,
} from './suggestionLayer'
import type { Hunk } from '../suggestions/types'

function stateWith(doc: string, hunks: Hunk[]) {
  const s = EditorState.create({ doc, extensions: [suggestionField] })
  return s.update({ effects: setDiffHunks.of(hunks) }).state
}

const hunk = (over: Partial<Hunk>): Hunk => ({ id: '0', from: 4, to: 7, insert: 'dog', status: 'pending', ...over })

describe('suggestionField', () => {
  it('starts empty and stores hunks set via the effect', () => {
    const s = stateWith('the cat sat', [hunk({})])
    expect(s.field(suggestionField)).toHaveLength(1)
    expect(s.field(suggestionField)[0].insert).toBe('dog')
  })

  it('shifts hunk positions when text is inserted before it', () => {
    const s = stateWith('the cat sat', [hunk({ from: 4, to: 7 })])
    const next = s.update({ changes: { from: 0, insert: 'XX ' } }).state
    const h = next.field(suggestionField)[0]
    expect(h.status).toBe('pending')
    expect(h.from).toBe(7)
    expect(h.to).toBe(10)
  })

  it('leaves a hunk untouched when text is inserted after it', () => {
    const s = stateWith('the cat sat', [hunk({ from: 4, to: 7 })])
    const next = s.update({ changes: { from: 11, insert: '!' } }).state
    const h = next.field(suggestionField)[0]
    expect(h.from).toBe(4)
    expect(h.to).toBe(7)
  })

  it('invalidates a hunk when the user edits inside its range', () => {
    const s = stateWith('the cat sat', [hunk({ from: 4, to: 7 })])
    const next = s.update({ changes: { from: 5, to: 6, insert: 'X' } }).state
    expect(next.field(suggestionField)[0].status).toBe('invalidated')
  })

  it('invalidates a hunk when its entire span is deleted', () => {
    const s = stateWith('the cat sat', [hunk({ from: 4, to: 7 })])
    const next = s.update({ changes: { from: 4, to: 7, insert: '' } }).state
    expect(next.field(suggestionField)[0].status).toBe('invalidated')
  })

  it('removeHunk drops one hunk by id; clearHunks empties the field', () => {
    const s = stateWith('the cat sat', [hunk({ id: 'a' }), hunk({ id: 'b' })])
    const afterRemove = s.update({ effects: removeHunk.of('a') }).state
    expect(afterRemove.field(suggestionField).map((h) => h.id)).toEqual(['b'])
    const cleared = afterRemove.update({ effects: clearHunks.of(null) }).state
    expect(cleared.field(suggestionField)).toEqual([])
  })

  it('keeps a hunk pending when text is inserted exactly at its end boundary', () => {
    const s = stateWith('the cat sat', [hunk({ from: 4, to: 7 })])
    const next = s.update({ changes: { from: 7, insert: 'X' } }).state
    const h = next.field(suggestionField)[0]
    expect(h.status).toBe('pending')
    expect(h.from).toBe(4)
    expect(h.to).toBe(7)
  })

  it('excludes text inserted exactly at the start boundary from the hunk', () => {
    const s = stateWith('the cat sat', [hunk({ from: 4, to: 7 })])
    const next = s.update({ changes: { from: 4, insert: 'Z' } }).state
    const h = next.field(suggestionField)[0]
    expect(h.status).toBe('pending')
    expect(next.doc.sliceString(h.from, h.to)).toBe('cat')
  })

  it('keeps a point (insertion) hunk a point after typing at its anchor', () => {
    const s = stateWith('the  sat', [hunk({ from: 4, to: 4, insert: 'cat' })])
    const next = s.update({ changes: { from: 4, insert: 'Z' } }).state
    const h = next.field(suggestionField)[0]
    expect(h.status).toBe('pending')
    expect(h.from).toBe(h.to)
  })

  it('invalidates only the hunk edited through, shifting the others', () => {
    const s = stateWith('the cat sat on mat', [
      hunk({ id: 'a', from: 4, to: 7, insert: 'dog' }),
      hunk({ id: 'b', from: 15, to: 18, insert: 'rug' }),
    ])
    const next = s.update({ changes: { from: 5, to: 6, insert: 'X' } }).state
    const byId = Object.fromEntries(next.field(suggestionField).map((h) => [h.id, h]))
    expect(byId.a.status).toBe('invalidated')
    expect(byId.b.status).toBe('pending')
    expect(byId.b.from).toBe(15)
  })
})

describe('suggestion decorations (mounted)', () => {
  it('renders a strikethrough deletion and an insertion widget', () => {
    const view = new EditorView({
      state: EditorState.create({ doc: 'the cat sat', extensions: [suggestionExtension()] }),
      parent: document.body,
    })
    view.dispatch({ effects: setDiffHunks.of([hunk({ from: 4, to: 7, insert: 'dog' })]) })
    expect(view.dom.querySelector('.cm-sug-del')?.textContent).toBe('cat')
    expect(view.dom.querySelector('.cm-sug-ins')?.textContent).toBe('dog')
    expect(view.dom.querySelector('.cm-sug-accept')).not.toBeNull()
    view.destroy()
  })

  it('applyHunkInView applies the change and removes the hunk', () => {
    const view = new EditorView({
      state: EditorState.create({ doc: 'the cat sat', extensions: [suggestionExtension()] }),
      parent: document.body,
    })
    view.dispatch({ effects: setDiffHunks.of([hunk({ from: 4, to: 7, insert: 'dog' })]) })
    applyHunkInView(view, '0')
    expect(view.state.doc.toString()).toBe('the dog sat')
    expect(view.state.field(suggestionField)).toHaveLength(0)
    view.destroy()
  })

  it('rejectHunkInView removes the hunk without changing the document', () => {
    const view = new EditorView({
      state: EditorState.create({ doc: 'the cat sat', extensions: [suggestionExtension()] }),
      parent: document.body,
    })
    view.dispatch({ effects: setDiffHunks.of([hunk({ from: 4, to: 7, insert: 'dog' })]) })
    rejectHunkInView(view, '0')
    expect(view.state.doc.toString()).toBe('the cat sat')
    expect(view.state.field(suggestionField)).toHaveLength(0)
    view.destroy()
  })
})
