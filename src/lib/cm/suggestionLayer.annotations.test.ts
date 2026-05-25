import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import {
  annotationField,
  addAnnotation,
  removeAnnotation,
  clearAnnotations,
  setAnnotationEditing,
  updateAnnotationNote,
  setAnnotationCollapsed,
  setAllAnnotationsCollapsed,
  acceptAnnotationInView,
  dismissAnnotationInView,
  suggestionExtension,
  suggestionCallbacks,
  type SuggestionCallbacks,
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

describe('annotation editing + collapse effects', () => {
  it('setAnnotationEditing toggles the editing flag on the matching annotation', () => {
    const s = stateWith('the cat sat', [ann({ id: 'a' })])
    const on = s.update({ effects: setAnnotationEditing.of({ id: 'a', editing: true }) }).state
    expect(on.field(annotationField)[0].editing).toBe(true)
    const off = on.update({ effects: setAnnotationEditing.of({ id: 'a', editing: false }) }).state
    expect(off.field(annotationField)[0].editing).toBe(false)
  })

  it('updateAnnotationNote replaces the note text', () => {
    const s = stateWith('the cat sat', [ann({ id: 'a', note: 'old' })])
    const next = s.update({ effects: updateAnnotationNote.of({ id: 'a', note: 'new text' }) }).state
    expect(next.field(annotationField)[0].note).toBe('new text')
  })

  it('setAnnotationCollapsed sets collapsed on only the matching annotation', () => {
    const s = stateWith('the cat sat', [ann({ id: 'a' }), ann({ id: 'b' })])
    const next = s.update({ effects: setAnnotationCollapsed.of({ id: 'b', collapsed: true }) }).state
    const byId = Object.fromEntries(next.field(annotationField).map((a) => [a.id, a.collapsed]))
    expect(byId).toEqual({ a: undefined, b: true })
  })

  it('setAllAnnotationsCollapsed collapses/expands every open annotation', () => {
    const s = stateWith('the cat sat', [ann({ id: 'a' }), ann({ id: 'b' })])
    const all = s.update({ effects: setAllAnnotationsCollapsed.of(true) }).state
    expect(all.field(annotationField).every((a) => a.collapsed === true)).toBe(true)
    const none = all.update({ effects: setAllAnnotationsCollapsed.of(false) }).state
    expect(none.field(annotationField).every((a) => a.collapsed === false)).toBe(true)
  })
})

describe('annotation card states (mounted)', () => {
  function mountWith(anns: Annotation[]) {
    const view = new EditorView({
      state: EditorState.create({ doc: 'the cat sat', extensions: [suggestionExtension()] }),
      parent: document.body,
    })
    for (const a of anns) view.dispatch({ effects: addAnnotation.of(a) })
    return view
  }

  it('expanded card shows Edit and Collapse actions alongside Dismiss', () => {
    const view = mountWith([ann({ from: 4, to: 7 })])
    expect(view.dom.querySelector('.cm-annot-edit')).not.toBeNull()
    expect(view.dom.querySelector('.cm-annot-collapse')).not.toBeNull()
    expect(view.dom.querySelector('.cm-annot-dismiss')).not.toBeNull()
    view.destroy()
  })

  it('editing card renders a textarea prefilled with the note and a Save action', () => {
    const view = mountWith([ann({ from: 4, to: 7, note: 'my draft note', editing: true })])
    const ta = view.dom.querySelector('.cm-annot-card textarea') as HTMLTextAreaElement | null
    expect(ta).not.toBeNull()
    expect(ta?.value).toBe('my draft note')
    expect(view.dom.querySelector('.cm-annot-save')).not.toBeNull()
    view.destroy()
  })

  it('collapsed card shows only the author + number, not the note body', () => {
    const view = mountWith([ann({ from: 4, to: 7, note: 'hidden when collapsed', author: 'You', collapsed: true })])
    const card = view.dom.querySelector('.cm-annot-card')
    expect(card?.textContent).toContain('You')
    expect(card?.querySelector('.cm-annot-num')).not.toBeNull()
    expect(card?.textContent).not.toContain('hidden when collapsed')
    // No note body and no edit affordance while collapsed.
    expect(card?.querySelector('.cm-annot-note')).toBeNull()
    view.destroy()
  })
})

describe('annotation card interactions (mounted, wired callbacks)', () => {
  function mountWith(anns: Annotation[], cb: Partial<SuggestionCallbacks>) {
    const view = new EditorView({
      state: EditorState.create({
        doc: 'the cat sat',
        extensions: [suggestionExtension(), suggestionCallbacks.of(cb as SuggestionCallbacks)],
      }),
      parent: document.body,
    })
    for (const a of anns) view.dispatch({ effects: addAnnotation.of(a) })
    return view
  }
  const mousedown = (el: Element | null) =>
    el?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

  it('typing in the editor textarea and clicking Save passes the typed value through', () => {
    const saved: Array<{ id: string; note: string }> = []
    const view = mountWith(
      [ann({ id: 'n1', from: 4, to: 7, note: '', editing: true })],
      { saveAnnotationNote: (id, note) => saved.push({ id, note }) },
    )
    const ta = view.dom.querySelector('.cm-annot-card textarea') as HTMLTextAreaElement
    ta.value = 'a reader note'
    mousedown(view.dom.querySelector('.cm-annot-save'))
    expect(saved).toEqual([{ id: 'n1', note: 'a reader note' }])
    view.destroy()
  })

  it('Save on an empty draft dismisses instead of saving an empty note', () => {
    const calls: string[] = []
    const view = mountWith(
      [ann({ id: 'n2', from: 4, to: 7, note: '', editing: true })],
      {
        saveAnnotationNote: () => calls.push('save'),
        dismissAnnotation: () => calls.push('dismiss'),
      },
    )
    // textarea left blank
    mousedown(view.dom.querySelector('.cm-annot-save'))
    expect(calls).toEqual(['dismiss'])
    view.destroy()
  })

  it('Collapse button toggles collapse for that annotation', () => {
    const toggled: string[] = []
    const view = mountWith(
      [ann({ id: 'n3', from: 4, to: 7 })],
      { toggleAnnotationCollapsed: (id) => toggled.push(id) },
    )
    mousedown(view.dom.querySelector('.cm-annot-collapse'))
    expect(toggled).toEqual(['n3'])
    view.destroy()
  })

  it('clicking the number badge on a collapsed card expands it', () => {
    const toggled: string[] = []
    const view = mountWith(
      [ann({ id: 'n4', from: 4, to: 7, collapsed: true })],
      { toggleAnnotationCollapsed: (id) => toggled.push(id) },
    )
    mousedown(view.dom.querySelector('.cm-annot-card .cm-annot-num'))
    expect(toggled).toEqual(['n4'])
    view.destroy()
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

describe('annotation badge numbers + quote-in-card', () => {
  function mountWith(doc: string, anns: Annotation[]) {
    const view = new EditorView({
      state: EditorState.create({ doc, extensions: [suggestionExtension()] }),
      parent: document.body,
    })
    for (const a of anns) view.dispatch({ effects: addAnnotation.of(a) })
    return view
  }

  it('card shows the referenced snippet for an anchored annotation', () => {
    // 'the cat sat' — cat is at 4..7
    const view = mountWith('the cat sat', [ann({ from: 4, to: 7 })])
    const quoteEl = view.dom.querySelector('.cm-annot-quote')
    expect(quoteEl).not.toBeNull()
    expect(quoteEl?.textContent).toContain('cat')
    view.destroy()
  })

  it('anchored annotation renders an in-text badge cm-annot-num-inline', () => {
    const view = mountWith('the cat sat', [ann({ from: 4, to: 7 })])
    const badge = view.dom.querySelector('.cm-annot-num-inline')
    expect(badge).not.toBeNull()
    view.destroy()
  })

  it('in-text badge number matches the card header badge number', () => {
    const view = mountWith('the cat sat', [ann({ from: 4, to: 7 })])
    const inlineBadge = view.dom.querySelector('.cm-annot-num-inline')
    const cardBadge = view.dom.querySelector('.cm-annot-card .cm-annot-num')
    expect(inlineBadge).not.toBeNull()
    expect(cardBadge).not.toBeNull()
    expect(inlineBadge?.textContent).toBe(cardBadge?.textContent)
    view.destroy()
  })

  it('two anchored annotations get sequential numbers in document order', () => {
    // first annotation: from=4 (cat), second: from=8 (sat)
    const view = mountWith('the cat sat', [
      ann({ id: 'b', from: 8, to: 11, note: 'second' }),  // added first but higher position
      ann({ id: 'a', from: 4, to: 7, note: 'first' }),    // added second but lower position
    ])
    const badges = view.dom.querySelectorAll('.cm-annot-num-inline')
    // should have 2 badges; the one at lower from should have "1"
    expect(badges.length).toBe(2)
    // The first badge in document order (left to right) should be "1"
    expect(badges[0].textContent).toBe('1')
    expect(badges[1].textContent).toBe('2')
    view.destroy()
  })

  it('unanchored annotation (from===to) has no mark and no inline badge, but card is present', () => {
    // zero-width annotation with a stored quote
    const unanchored: Annotation = {
      id: 'u1',
      from: 5,
      to: 5,
      note: 'could not locate',
      author: 'AI',
      status: 'open',
      quote: 'xyz does not exist',
    }
    const view = mountWith('the cat sat', [unanchored])
    // No inline badge
    expect(view.dom.querySelector('.cm-annot-num-inline')).toBeNull()
    // No cm-annot mark (highlight)
    expect(view.dom.querySelector('.cm-annot')).toBeNull()
    // Card is present
    expect(view.dom.querySelector('.cm-annot-card')).not.toBeNull()
    // Card shows the stored quote
    const quoteEl = view.dom.querySelector('.cm-annot-quote')
    expect(quoteEl).not.toBeNull()
    expect(quoteEl?.textContent).toContain('xyz does not exist')
    view.destroy()
  })

  it('rebuilds the card DOM when the span shifts so the snippet is never stale', () => {
    // 'the cat sat dog' — annotate "cat" at 4..7
    const view = mountWith('the cat sat dog', [ann({ from: 4, to: 7, note: 'about cat' })])
    const cardBefore = view.dom.querySelector('.cm-annot-card')
    expect(cardBefore?.querySelector('.cm-annot-quote')?.textContent).toContain('cat')

    // Insert text BEFORE the span. The annotation remaps to new from/to. If
    // eq() ignored from/to, CM would reuse the SAME cached DOM node (whose
    // quote snippet was sliced from the OLD offsets). Requiring a rebuilt node
    // proves the snippet is recomputed against the current span.
    view.dispatch({ changes: { from: 0, insert: 'XX ' } })

    const a = view.state.field(annotationField)[0]
    expect(a.status).toBe('open')
    // Span shifted but still covers "cat".
    expect(view.state.doc.sliceString(a.from, a.to)).toBe('cat')

    const cardAfter = view.dom.querySelector('.cm-annot-card')
    // DOM node must be rebuilt (not reused), so the snippet reflects the
    // current span rather than stale offsets.
    expect(cardAfter).not.toBe(cardBefore)
    expect(cardAfter?.querySelector('.cm-annot-quote')?.textContent).toContain('cat')
    view.destroy()
  })
})
