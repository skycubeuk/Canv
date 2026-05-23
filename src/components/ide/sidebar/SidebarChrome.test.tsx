import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Plus, FileText } from 'lucide-react'
import {
  SidebarHeader, SidebarIconButton, SidebarSectionTitle,
  SidebarRow, SidebarRowIcon, SidebarMeta, SidebarEmpty, SidebarPanelFooter,
  SidebarRowFrame,
} from './SidebarChrome'

describe('SidebarChrome', () => {
  it('SidebarHeader renders title in canonical token style', () => {
    render(<SidebarHeader title="Workspace" />)
    const el = screen.getByText('Workspace')
    expect(el.className).toMatch(/text-\[10\.5px\]/)
    expect(el.className).toMatch(/font-semibold/)
    expect(el.className).toMatch(/uppercase/)
    expect(el.className).toMatch(/tracking-wider/)
    expect(el.className).toMatch(/text-subtle/)
  })

  it('SidebarHeader renders actions slot when provided', () => {
    render(
      <SidebarHeader
        title="Workspace"
        actions={<button type="button" aria-label="x" />}
      />,
    )
    expect(screen.getByRole('button', { name: 'x' })).toBeInTheDocument()
  })

  it('SidebarIconButton renders a 22x22 button with a 12px icon and fires onClick', () => {
    const onClick = vi.fn()
    render(
      <SidebarIconButton aria-label="New file" icon={Plus} onClick={onClick} />,
    )
    const btn = screen.getByRole('button', { name: 'New file' })
    expect(btn.className).toMatch(/w-\[22px\]/)
    expect(btn.className).toMatch(/h-\[22px\]/)
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('SidebarSectionTitle uses the same token style as SidebarHeader title', () => {
    render(<SidebarSectionTitle>Current changes</SidebarSectionTitle>)
    const el = screen.getByText('Current changes')
    expect(el.className).toMatch(/text-\[10\.5px\]/)
    expect(el.className).toMatch(/uppercase/)
  })

  it('SidebarRow is a button with 12.5px row tokens and fires onClick', () => {
    const onClick = vi.fn()
    render(<SidebarRow onClick={onClick}>Row text</SidebarRow>)
    const btn = screen.getByRole('button', { name: /row text/i })
    expect(btn.className).toMatch(/text-\[12\.5px\]/)
    expect(btn.className).toMatch(/py-\[3px\]/)
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('SidebarRowIcon wraps a Lucide icon at w-3.5 h-3.5', () => {
    const { container } = render(<SidebarRowIcon icon={FileText} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('class') ?? '').toMatch(/w-3\.5/)
    expect(svg.getAttribute('class') ?? '').toMatch(/h-3\.5/)
  })

  it('SidebarMeta uses 10px font-mono text-subtle', () => {
    render(<SidebarMeta>1:23</SidebarMeta>)
    const el = screen.getByText('1:23')
    expect(el.className).toMatch(/text-\[10px\]/)
    expect(el.className).toMatch(/font-mono/)
    expect(el.className).toMatch(/text-subtle/)
  })

  it('SidebarEmpty renders muted helper text', () => {
    render(<SidebarEmpty>No results.</SidebarEmpty>)
    const el = screen.getByText('No results.')
    expect(el.className).toMatch(/text-xs/)
    expect(el.className).toMatch(/text-subtle/)
  })

  it('SidebarPanelFooter has top border + standard padding', () => {
    render(<SidebarPanelFooter><span>foot</span></SidebarPanelFooter>)
    const el = screen.getByText('foot').parentElement!
    expect(el.className).toMatch(/border-t/)
    expect(el.className).toMatch(/border-default/)
    expect(el.className).toMatch(/px-side/)
    expect(el.className).toMatch(/py-2/)
  })
})

describe('SidebarRowFrame', () => {
  it('renders leading, children, and trailing in order inside an <li>', () => {
    render(
      <ul>
        <SidebarRowFrame
          leading={<span data-testid="lead">L</span>}
          trailing={<span data-testid="trail">T</span>}
        >
          <span data-testid="content">C</span>
        </SidebarRowFrame>
      </ul>,
    )
    const li = screen.getByRole('listitem')
    const innerKids = Array.from((li.querySelector(':scope > div') as HTMLElement).children) as HTMLElement[]
    expect(innerKids[0]).toHaveTextContent('L')
    expect(innerKids[1]).toHaveTextContent('C')
    expect(innerKids[2]).toHaveTextContent('T')
  })

  it('inner row container carries the canonical side indent (pl-side)', () => {
    render(
      <ul>
        <SidebarRowFrame><span>x</span></SidebarRowFrame>
      </ul>,
    )
    const inner = screen.getByRole('listitem').querySelector(':scope > div') as HTMLElement
    expect(inner.className).toContain('pl-side')
  })

  it('renders the menu slot as a sibling of the row layout, inside the <li>', () => {
    render(
      <ul>
        <SidebarRowFrame menu={<div data-testid="menu">M</div>}>
          <span>x</span>
        </SidebarRowFrame>
      </ul>,
    )
    const li = screen.getByRole('listitem')
    const menu = screen.getByTestId('menu')
    expect(menu.parentElement).toBe(li)
  })

  it('omits trailing slot when not provided', () => {
    render(
      <ul>
        <SidebarRowFrame leading={<span>L</span>}>
          <span>x</span>
        </SidebarRowFrame>
      </ul>,
    )
    const inner = screen.getByRole('listitem').querySelector(':scope > div') as HTMLElement
    expect(inner.children.length).toBe(2) // leading + content, no trailing
  })
})
