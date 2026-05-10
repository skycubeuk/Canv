import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContextMenu } from './ContextMenu'

describe('ContextMenu', () => {
  it('renders items and a separator', () => {
    render(
      <ContextMenu
        x={10} y={10}
        items={[
          { id: 'cut', label: 'Cut', onClick: () => {} },
          { separator: true },
          { id: 'all', label: 'Select all', onClick: () => {} },
        ]}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('Cut')).toBeInTheDocument()
    expect(screen.getByText('Select all')).toBeInTheDocument()
    expect(screen.getByRole('menu').querySelector('hr')).not.toBeNull()
  })

  it('clicking an enabled item calls its handler', async () => {
    const handler = vi.fn()
    render(
      <ContextMenu
        x={0} y={0}
        items={[{ id: 'copy', label: 'Copy', onClick: handler }]}
        onClose={() => {}}
      />,
    )
    await userEvent.click(screen.getByText('Copy'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('clicking a disabled item does not call its handler', async () => {
    const handler = vi.fn()
    render(
      <ContextMenu
        x={0} y={0}
        items={[{ id: 'paste', label: 'Paste', onClick: handler, disabled: true }]}
        onClose={() => {}}
      />,
    )
    await userEvent.click(screen.getByText('Paste'))
    expect(handler).not.toHaveBeenCalled()
  })

  it('Escape calls onClose', () => {
    const onClose = vi.fn()
    render(
      <ContextMenu
        x={0} y={0}
        items={[{ id: 'x', label: 'X', onClick: () => {} }]}
        onClose={onClose}
      />,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('mousedown outside the menu calls onClose', () => {
    const onClose = vi.fn()
    render(
      <div>
        <span data-testid="outside">outside</span>
        <ContextMenu
          x={0} y={0}
          items={[{ id: 'x', label: 'X', onClick: () => {} }]}
          onClose={onClose}
        />
      </div>,
    )
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(onClose).toHaveBeenCalled()
  })

  it('right-click on the menu does not bubble to the document', () => {
    const onClose = vi.fn()
    render(
      <ContextMenu
        x={0} y={0}
        items={[{ id: 'x', label: 'X', onClick: () => {} }]}
        onClose={onClose}
      />,
    )
    const menu = screen.getByRole('menu')
    const event = fireEvent.contextMenu(menu)
    expect(event).toBe(false)
  })
})
