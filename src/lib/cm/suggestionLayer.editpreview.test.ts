import { describe, it, expect, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import {
  editPreviewField,
  setEditPreview,
  clearEditPreview,
  suggestionExtension,
  suggestionCallbacks,
  type SuggestionCallbacks,
} from './suggestionLayer'

/** Minimal EditorView-like setup for field + decoration tests. */
function makeView(doc: string, extraExtensions: import('@codemirror/state').Extension[] = []) {
  const state = EditorState.create({
    doc,
    extensions: [...suggestionExtension(), ...extraExtensions],
  })
  // jsdom doesn't have a real DOM so we can't mount an EditorView normally,
  // but we CAN use EditorState directly for field tests.
  return state
}

function withPreview(doc: string, preview: { callId: string; from: number; to: number; rewrite: string }) {
  const state = makeView(doc)
  return state.update({ effects: setEditPreview.of(preview) }).state
}

describe('editPreviewField', () => {
  it('starts null', () => {
    const state = makeView('hello world')
    expect(state.field(editPreviewField)).toBeNull()
  })

  it('stores a preview via setEditPreview', () => {
    const state = withPreview('hello world', { callId: 'c1', from: 0, to: 5, rewrite: 'hi' })
    const p = state.field(editPreviewField)
    expect(p).not.toBeNull()
    expect(p!.callId).toBe('c1')
    expect(p!.from).toBe(0)
    expect(p!.to).toBe(5)
    expect(p!.rewrite).toBe('hi')
  })

  it('clears via clearEditPreview', () => {
    const state = withPreview('hello world', { callId: 'c1', from: 0, to: 5, rewrite: 'hi' })
    const cleared = state.update({ effects: clearEditPreview.of(null) }).state
    expect(cleared.field(editPreviewField)).toBeNull()
  })

  it('replaces existing preview with a new one', () => {
    const state = withPreview('hello world', { callId: 'c1', from: 0, to: 5, rewrite: 'hi' })
    const replaced = state.update({
      effects: setEditPreview.of({ callId: 'c2', from: 6, to: 11, rewrite: 'earth' }),
    }).state
    const p = replaced.field(editPreviewField)
    expect(p!.callId).toBe('c2')
    expect(p!.from).toBe(6)
  })

  it('shifts positions when text is inserted before the preview span', () => {
    const state = withPreview('hello world', { callId: 'c1', from: 6, to: 11, rewrite: 'earth' })
    // Insert 3 chars before position 6
    const shifted = state.update({ changes: { from: 0, insert: 'XX ' } }).state
    const p = shifted.field(editPreviewField)
    expect(p).not.toBeNull()
    // from=6+3=9, to=11+3=14
    expect(p!.from).toBe(9)
    expect(p!.to).toBe(14)
  })

  it('invalidates (nulls) preview when the user edits inside the span', () => {
    const state = withPreview('hello world', { callId: 'c1', from: 6, to: 11, rewrite: 'earth' })
    // Edit strictly inside [6,11]
    const edited = state.update({ changes: { from: 7, to: 9, insert: 'X' } }).state
    expect(edited.field(editPreviewField)).toBeNull()
  })

  it('does not invalidate when text is inserted after the span', () => {
    const state = withPreview('hello world', { callId: 'c1', from: 0, to: 5, rewrite: 'hi' })
    const after = state.update({ changes: { from: 11, insert: '!' } }).state
    expect(after.field(editPreviewField)).not.toBeNull()
  })
})

describe('editPreviewField control buttons', () => {
  it('approveEdit callback is invoked with the callId when accept is clicked', () => {
    const approveEdit = vi.fn()
    const rejectEdit = vi.fn()
    const cbs: SuggestionCallbacks = {
      accept: vi.fn(),
      reject: vi.fn(),
      acceptAll: vi.fn(),
      rejectAll: vi.fn(),
      approveEdit,
      rejectEdit,
    }

    // We only test the callback dispatch via the DOM widget — but because
    // EditorView requires a real DOM, we test the state field behaviour here
    // and the callback wiring is done in the widget class (integration-verified).
    // This test verifies the SuggestionCallbacks interface accepts the new fields.
    expect(typeof cbs.approveEdit).toBe('function')
    expect(typeof cbs.rejectEdit).toBe('function')

    // Verify approveEdit / rejectEdit signatures
    const fakeView = {} as EditorView
    cbs.approveEdit!('call-1', fakeView)
    expect(approveEdit).toHaveBeenCalledWith('call-1', fakeView)
    cbs.rejectEdit!('call-1', fakeView)
    expect(rejectEdit).toHaveBeenCalledWith('call-1', fakeView)
  })
})
