import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { ContextMenuProvider, useContextMenu, type ContextMenuItem } from './contextMenu'

function Opener({ items, onMounted }: { items: ContextMenuItem[]; onMounted?: () => void }) {
  const ctx = useContextMenu()
  useEffect(() => { onMounted?.() }, [onMounted])
  return (
    <button
      onClick={(e) => ctx.open(e, items)}
      onContextMenu={(e) => ctx.open(e, items)}
    >
      open
    </button>
  )
}

describe('ContextMenuProvider', () => {
  it('opens a menu containing the given items', async () => {
    const handler = vi.fn()
    const items: ContextMenuItem[] = [{ id: 'cut', label: 'Cut', onClick: handler }]
    render(
      <ContextMenuProvider>
        <Opener items={items} />
      </ContextMenuProvider>,
    )
    await userEvent.click(screen.getByText('open'))
    expect(screen.getByText('Cut')).toBeInTheDocument()
  })

  it('clicking an item runs its handler then closes the menu', async () => {
    const handler = vi.fn()
    const items: ContextMenuItem[] = [{ id: 'copy', label: 'Copy', onClick: handler }]
    render(
      <ContextMenuProvider>
        <Opener items={items} />
      </ContextMenuProvider>,
    )
    await userEvent.click(screen.getByText('open'))
    await userEvent.click(screen.getByText('Copy'))
    expect(handler).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Copy')).toBeNull()
  })

  it('opening a second menu replaces the first', async () => {
    function Two() {
      const ctx = useContextMenu()
      return (
        <>
          <button onClick={(e) => ctx.open(e, [{ id: 'a', label: 'Alpha', onClick: () => {} }])}>A</button>
          <button onClick={(e) => ctx.open(e, [{ id: 'b', label: 'Beta', onClick: () => {} }])}>B</button>
        </>
      )
    }
    render(<ContextMenuProvider><Two /></ContextMenuProvider>)
    await userEvent.click(screen.getByText('A'))
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    await userEvent.click(screen.getByText('B'))
    expect(screen.queryByText('Alpha')).toBeNull()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('throws when useContextMenu is used outside the provider', () => {
    function Bad() { useContextMenu(); return null }
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Bad />)).toThrow(/ContextMenuProvider/)
    spy.mockRestore()
  })

  it('exposes isOpen on the controller', async () => {
    function Probe({ onState }: { onState: (open: boolean) => void }) {
      const ctx = useContextMenu()
      useEffect(() => { onState(ctx.isOpen) }, [ctx.isOpen, onState])
      return <Opener items={[{ id: 'x', label: 'Xyz', onClick: () => {} }]} />
    }
    const states: boolean[] = []
    render(
      <ContextMenuProvider>
        <Probe onState={(v) => states.push(v)} />
      </ContextMenuProvider>,
    )
    expect(states[states.length - 1]).toBe(false)
    await act(async () => { await userEvent.click(screen.getByText('open')) })
    expect(states[states.length - 1]).toBe(true)
  })
})
