import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { StatusBarItem } from './StatusBarItem'

beforeEach(() => cleanup())

describe('StatusBarItem', () => {
  it('renders text', () => {
    render(<StatusBarItem text="42 words" />)
    expect(screen.getByText('42 words')).toBeTruthy()
  })

  it('renders tooltip via title attribute on the span when no command', () => {
    render(<StatusBarItem text="x" tooltip="Total words" />)
    expect(screen.getByText('x').closest('span')?.getAttribute('title')).toBe('Total words')
  })

  it('dispatches onClick when command is provided', () => {
    const onClick = vi.fn()
    render(<StatusBarItem text="x" command="my.cmd" onCommandInvoke={onClick} />)
    fireEvent.click(screen.getByText('x'))
    expect(onClick).toHaveBeenCalledWith('my.cmd')
  })

  it('renders as a non-clickable span when no command', () => {
    render(<StatusBarItem text="x" />)
    expect(screen.getByText('x').closest('button')).toBeNull()
  })
})
