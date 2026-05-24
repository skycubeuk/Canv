import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { makeMarkdownState } from './markdownEditor'
import { suggestionField } from './suggestionLayer'

describe('markdown editor wiring', () => {
  it('includes the suggestion field', () => {
    const state: EditorState = makeMarkdownState({
      initialDoc: 'hello',
      onDocChange: () => {},
    })
    expect(state.field(suggestionField, false)).toEqual([])
  })
})
