import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FormatRow } from './FormatRow'

describe('FormatRow read-aloud', () => {
  it('calls onReadAloud with no voice override on the primary click', () => {
    const onReadAloud = vi.fn()
    render(<FormatRow view={null} onLink={vi.fn()} onAddNote={vi.fn()} onReadAloud={onReadAloud} />)
    fireEvent.click(screen.getByLabelText('Read aloud'))
    expect(onReadAloud).toHaveBeenCalledWith(undefined)
  })
})
