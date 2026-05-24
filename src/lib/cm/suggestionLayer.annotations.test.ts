import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import {
  annotationField,
  addAnnotation,
  removeAnnotation,
  clearAnnotations,
  acceptAnnotationInView,
  dismissAnnotationInView,
  suggestionExtension,
} from './suggestionLayer'
import type { Annotation } from '../suggestions/types'

const ann = (over: Partial<Annotation>): Annotation => ({
  id: 'a1',
  from: 4,
  to: 7,
  note: 'repeats earlier',
  author: 'Story Reviewer',
  status: 'open',
  ...over,
})

function stateWith(doc: string, anns: Annotation[]) {
  let s = EditorState.create({ doc, extensions: [annotationField] })
  for (const a of anns) s = s.update({ effects: addAnnotation.of(a) }).state
  return s
}

describe('annotationField', () => {
  it('starts empty and stores annotations added via the effect', () => {
    const s = stateWith('the cat sat', [ann({})])
    expect(s.field(annotationField)).toHaveLength(1)
    expect(s.field(annotationField)[0].note).toBe('repeats earlier')
  })

  it('shifts annotation positions when text is inserted before it', () => {
    const s = stateWith('the cat sat', [ann({ from: 4, to: 7 })])
    const next = s.update({ changes: { from: 0, insert: 'XX ' } }).state
    const a = next.field(annotationField)[0]
    expect(a.status).toBe('open')
    expect(a.from).toBe(7)
    expect(a.to).toBe(10)
  })

  it('invalidates an annotation when its anchored span is deleted', () => {
    const s = stateWith('the cat sat', [ann({ from: 4, to: 7 })])
    const next = s.update({ changes: { from: 4, to: 7, insert: '' } }).state
    expect(next.field(annotationField)[0].status).toBe('invalidated')
  })

  it('removeAnnotation drops by id; clearAnnotations empties', () => {
    const s = stateWith('the cat sat', [ann({ id: 'a' }), ann({ id: 'b' })])
    const afterRemove = s.update({ effects: removeAnnotation.of('a') }).state
    expect(afterRemove.field(annotationField).map((a) => a.id)).toEqual(['b'])
    const cleared = afterRemove.update({ effects: clearAnnotations.of(null) }).state
    expect(cleared.field(annotationField)).toEqual([])
  })
})

describe('annotation decorations + view helpers (mounted)', () => {
  function mountWith(anns: Annotation[]) {
    const view = new EditorView({
      state: EditorState.create({ doc: 'the cat sat', extensions: [suggestionExtension()] }),
      parent: document.body,
    })
    for (const a of anns) view.dispatch({ effects: addAnnotation.of(a) })
    return view
  }

  it('renders the note + author + Dismiss; shows Accept only when a replacement is present', () => {
    const view = mountWith([ann({ from: 4, to: 7, note: 'repeats earlier', author: 'Story Reviewer' })])
    const card = view.dom.querySelector('.cm-annot-card')
    expect(card?.textContent).toContain('Story Reviewer')
    expect(card?.textContent).toContain('repeats earlier')
    expect(view.dom.querySelector('.cm-annot-dismiss')).not.toBeNull()
    expect(view.dom.querySelector('.cm-annot-accept')).toBeNull()
    view.destroy()
  })

  it('dismissAnnotationInView removes the annotation without changing the doc', () => {
    const view = mountWith([ann({ id: 'x', from: 4, to: 7 })])
    dismissAnnotationInView(view, 'x')
    expect(view.state.field(annotationField)).toHaveLength(0)
    expect(view.state.doc.toString()).toBe('the cat sat')
    view.destroy()
  })

  it('acceptAnnotationInView applies the suggested replacement and drops the annotation', () => {
    const view = mountWith([ann({ id: 'y', from: 4, to: 7, suggestedReplacement: 'dog' })])
    acceptAnnotationInView(view, 'y')
    expect(view.state.doc.toString()).toBe('the dog sat')
    expect(view.state.field(annotationField)).toHaveLength(0)
    view.destroy()
  })

  it('renders the annotation card as a block below the line, not inline inside the text', () => {
    // Multi-line doc; annotation spans a word on line ONE
    const multilineDoc = 'line one here\nline two here\nline three'
    const view = new EditorView({
      state: EditorState.create({ doc: multilineDoc, extensions: [suggestionExtension()] }),
      parent: document.body,
    })
    // "one" is at position 5..8 on line one
    view.dispatch({
      effects: addAnnotation.of(
        ann({ id: 'block-test', from: 5, to: 8, note: 'check this', author: 'Reviewer' }),
      ),
    })

    // Card must exist somewhere in the editor DOM
    const card = view.dom.querySelector('.cm-annot-card')
    expect(card).not.toBeNull()

    // Card must NOT be a descendant of a .cm-line (block widgets sit outside inline flow)
    const cardInsideLine = view.dom.querySelector('.cm-line .cm-annot-card')
    expect(cardInsideLine).toBeNull()

    view.destroy()
  })
})
