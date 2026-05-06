import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatToolChip } from './ChatToolChip'

describe('ChatToolChip', () => {
  it('renders running state with the tool name and path', () => {
    render(<ChatToolChip name="read_file" inputPath="docs/foo.md" status="running" />)
    expect(screen.getByText(/Reading docs\/foo\.md/i)).toBeInTheDocument()
  })

  it('renders success collapsed with summary line', () => {
    render(<ChatToolChip name="read_file" inputPath="docs/foo.md" status="success" summary="412 lines" result="..." />)
    expect(screen.getByText(/docs\/foo\.md/)).toBeInTheDocument()
    expect(screen.getByText(/412 lines/)).toBeInTheDocument()
    expect(screen.queryByTestId('chip-result-body')).toBeNull()
  })

  it('expands on click and shows the raw result body', () => {
    render(<ChatToolChip name="read_file" inputPath="docs/foo.md" status="success" summary="412 lines" result="full content here" />)
    fireEvent.click(screen.getByRole('button', { name: /docs\/foo\.md/i }))
    expect(screen.getByTestId('chip-result-body').textContent).toContain('full content here')
  })

  it('renders error expanded by default with red styling', () => {
    render(<ChatToolChip name="read_file" inputPath="big.md" status="error" result="file too large" />)
    expect(screen.getByTestId('chip-result-body').textContent).toContain('file too large')
    expect(screen.getByTestId('chip-root')).toHaveClass('border-red-300')
  })
})
