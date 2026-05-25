import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { toggleInline, cycleHeading } from './markdownFormat'

/** Build a detached EditorView with the given doc and a [from,to] selection. */
function viewWith(doc: string, from: number, to = from): EditorView {
  const state = EditorState.create({ doc, selection: { anchor: from, head: to } })
  return new EditorView({ state })
}

describe('toggleInline', () => {
  it('wraps a non-empty selection and selects the inner text', () => {
    const v = viewWith('the cat sat', 4, 7) // "cat"
    toggleInline(v, '**')
    expect(v.state.doc.toString()).toBe('the **cat** sat')
    const s = v.state.selection.main
    expect(v.state.sliceDoc(s.from, s.to)).toBe('cat')
  })

  it('unwraps when the marks are INSIDE the selection', () => {
    const v = viewWith('the **cat** sat', 4, 11) // "**cat**"
    toggleInline(v, '**')
    expect(v.state.doc.toString()).toBe('the cat sat')
    const s = v.state.selection.main
    expect(v.state.sliceDoc(s.from, s.to)).toBe('cat')
  })

  it('unwraps when the marks are OUTSIDE the selection', () => {
    const v = viewWith('the **cat** sat', 6, 9) // "cat" only
    toggleInline(v, '**')
    expect(v.state.doc.toString()).toBe('the cat sat')
    const s = v.state.selection.main
    expect(v.state.sliceDoc(s.from, s.to)).toBe('cat')
  })

  it('inserts paired marks at an empty selection with the cursor between them', () => {
    const v = viewWith('the  sat', 4) // cursor in the gap
    toggleInline(v, '*')
    expect(v.state.doc.toString()).toBe('the ** sat')
    expect(v.state.selection.main.empty).toBe(true)
    expect(v.state.selection.main.from).toBe(5) // between the two '*'
  })
})

describe('cycleHeading', () => {
  it('cycles a single line none -> H1 -> H2 -> H3 -> none', () => {
    const v = viewWith('hello', 0)
    cycleHeading(v)
    expect(v.state.doc.toString()).toBe('# hello')
    cycleHeading(v)
    expect(v.state.doc.toString()).toBe('## hello')
    cycleHeading(v)
    expect(v.state.doc.toString()).toBe('### hello')
    cycleHeading(v)
    expect(v.state.doc.toString()).toBe('hello')
  })

  it('applies one target level to every line the selection touches', () => {
    const v = viewWith('one\n## two', 0, 'one\n## two'.length)
    cycleHeading(v)
    expect(v.state.doc.toString()).toBe('# one\n# two')
  })
})
