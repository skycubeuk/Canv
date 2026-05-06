import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatTodoCard } from './ChatTodoCard'

describe('ChatTodoCard', () => {
  it('renders a pending item with empty checkbox and content text', () => {
    render(<ChatTodoCard resultJson={JSON.stringify({
      todos: [{ content: 'Add foo', activeForm: 'Adding foo', status: 'pending' }],
    })} />)
    const item = screen.getByTestId('todo-item-0')
    expect(item.textContent).toContain('☐')
    expect(item.textContent).toContain('Add foo')
    expect(item.textContent).not.toContain('Adding foo')
  })

  it('renders an in_progress item with the activeForm and an animated dot', () => {
    render(<ChatTodoCard resultJson={JSON.stringify({
      todos: [{ content: 'Add foo', activeForm: 'Adding foo', status: 'in_progress' }],
    })} />)
    const item = screen.getByTestId('todo-item-0')
    expect(item.textContent).toContain('Adding foo')
    expect(item.textContent).not.toContain('Add foo —')
    expect(item.querySelector('[data-testid="todo-spinner"]')).not.toBeNull()
  })

  it('renders a completed item with checked box and strikethrough', () => {
    render(<ChatTodoCard resultJson={JSON.stringify({
      todos: [{ content: 'Add foo', activeForm: 'Adding foo', status: 'completed' }],
    })} />)
    const item = screen.getByTestId('todo-item-0')
    expect(item.textContent).toContain('☑')
    expect(item.textContent).toContain('Add foo')
    expect(item.className).toMatch(/line-through/)
  })

  it('renders multiple items in order', () => {
    render(<ChatTodoCard resultJson={JSON.stringify({
      todos: [
        { content: 'A', activeForm: 'Doing A', status: 'completed' },
        { content: 'B', activeForm: 'Doing B', status: 'in_progress' },
        { content: 'C', activeForm: 'Doing C', status: 'pending' },
      ],
    })} />)
    expect(screen.getByTestId('todo-item-0').textContent).toContain('A')
    expect(screen.getByTestId('todo-item-1').textContent).toContain('Doing B')
    expect(screen.getByTestId('todo-item-2').textContent).toContain('C')
  })

  it('renders nothing for an empty list', () => {
    const { container } = render(<ChatTodoCard resultJson={JSON.stringify({ todos: [] })} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing for missing JSON (in-flight tool call)', () => {
    const { container } = render(<ChatTodoCard resultJson={undefined} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a fallback for malformed JSON', () => {
    render(<ChatTodoCard resultJson="not-json" />)
    expect(screen.getByText(/could not render/i)).toBeInTheDocument()
  })

  it('renders a fallback when todos is not an array', () => {
    render(<ChatTodoCard resultJson={JSON.stringify({ todos: 'oops' })} />)
    expect(screen.getByText(/could not render/i)).toBeInTheDocument()
  })
})
