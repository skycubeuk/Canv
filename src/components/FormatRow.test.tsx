import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { FormatRow } from './FormatRow'

function makeView(doc: string, from: number, to: number): EditorView {
  const state = EditorState.create({ doc, selection: { anchor: from, head: to } })
  return new EditorView({ state })
}

describe('FormatRow', () => {
  it('renders the formatting + note buttons', () => {
    render(<FormatRow view={null} onLink={vi.fn()} onAddNote={vi.fn()} />)
    expect(screen.getByRole('button', { name: /bold/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /italic/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /strikethrough/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /inline code/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /heading/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /link/i })).toBeTruthy()
    expect(screen.getByTestId('floating-toolbar-add-note')).toBeTruthy()
  })

  it('applies bold to the active editor selection when Bold is clicked', async () => {
    const user = userEvent.setup()
    const view = makeView('the cat sat', 4, 7) // "cat"
    render(<FormatRow view={view} onLink={vi.fn()} onAddNote={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /bold/i }))
    expect(view.state.doc.toString()).toBe('the **cat** sat')
  })

  it('does not throw when view is null', async () => {
    const user = userEvent.setup()
    render(<FormatRow view={null} onLink={vi.fn()} onAddNote={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /bold/i }))
    // no assertion needed — clicking a format button with no active editor must be a no-op, not a crash
  })

  it('delegates Link and Note to their callbacks', async () => {
    const user = userEvent.setup()
    const onLink = vi.fn()
    const onAddNote = vi.fn()
    const view = makeView('the cat sat', 4, 7)
    render(<FormatRow view={view} onLink={onLink} onAddNote={onAddNote} />)
    await user.click(screen.getByRole('button', { name: /link/i }))
    await user.click(screen.getByTestId('floating-toolbar-add-note'))
    expect(onLink).toHaveBeenCalledTimes(1)
    expect(onAddNote).toHaveBeenCalledTimes(1)
  })
})
