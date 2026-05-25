import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { toggleInline, cycleHeading, insertLink } from './markdownFormat'

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

describe('insertLink', () => {
  it('wraps the selection and places the cursor after the link when a url is given', () => {
    const v = viewWith('see docs here', 4, 8) // "docs"
    insertLink(v, 'https://x.dev')
    expect(v.state.doc.toString()).toBe('see [docs](https://x.dev) here')
    const s = v.state.selection.main
    expect(s.empty).toBe(true)
    expect(s.from).toBe('see [docs](https://x.dev)'.length)
  })

  it('inserts an empty-paren link and parks the cursor inside the parens when no url', () => {
    const v = viewWith('see docs here', 4, 8) // "docs"
    insertLink(v) // no url -> keyboard path
    expect(v.state.doc.toString()).toBe('see [docs]() here')
    const s = v.state.selection.main
    expect(s.empty).toBe(true)
    expect(s.from).toBe('see [docs]('.length) // inside the ()
  })

  it('handles an empty selection', () => {
    const v = viewWith('see  here', 4)
    insertLink(v, 'https://x.dev')
    expect(v.state.doc.toString()).toBe('see [](https://x.dev) here')
  })
})
