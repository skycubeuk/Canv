import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CollapsibleBlob } from './CollapsibleBlob'

describe('CollapsibleBlob', () => {
  it('renders a chip with name and computed byte size, collapsed by default', () => {
    render(<CollapsibleBlob name="tool_call · read_file" body="hello world" />)
    expect(screen.getByRole('button')).toHaveTextContent('tool_call · read_file')
    expect(screen.getByRole('button')).toHaveTextContent('11 B')
    expect(screen.queryByTestId('collapsible-body')).toBeNull()
  })

  it('expands on click and shows the body in a <pre>', () => {
    render(<CollapsibleBlob name="x" body={'line1\nline2'} />)
    fireEvent.click(screen.getByRole('button'))
    const body = screen.getByTestId('collapsible-body')
    expect(body.tagName).toBe('PRE')
    expect(body.textContent).toContain('line1')
  })

  it('collapses again on second click', () => {
    render(<CollapsibleBlob name="x" body="content" />)
    const btn = screen.getByRole('button')
    fireEvent.click(btn)
    expect(screen.getByTestId('collapsible-body')).toBeInTheDocument()
    fireEvent.click(btn)
    expect(screen.queryByTestId('collapsible-body')).toBeNull()
  })

  it('formats KB sizes when body is large', () => {
    const body = 'a'.repeat(2048)
    render(<CollapsibleBlob name="x" body={body} />)
    expect(screen.getByRole('button')).toHaveTextContent('2.0 KB')
  })

  it('renders a tone="error" badge when error prop is true', () => {
    render(<CollapsibleBlob name="x" body="boom" error />)
    expect(screen.getByText('err')).toBeInTheDocument()
  })

  it('renders a "denied" badge when denied prop is true (takes precedence over error)', () => {
    render(<CollapsibleBlob name="x" body="-" denied />)
    expect(screen.getByText('denied')).toBeInTheDocument()
    expect(screen.queryByText('err')).toBeNull()
  })

  it('starts expanded when defaultOpen is true', () => {
    render(<CollapsibleBlob name="x" body="content" defaultOpen />)
    expect(screen.getByTestId('collapsible-body')).toBeInTheDocument()
  })
})
