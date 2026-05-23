import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SitesTab } from './SitesTab'

const mkEntry = (over = {}) => ({
  id: 'a3f2', name: 'Story Timeline', description: 'desc',
  folder: '.canv/sites/a3f2', entry: 'index.html',
  created: '2026-05-01T00:00:00Z', updated: '2026-05-01T00:00:00Z',
  prompt: 'orig prompt', source_files: ['chapters/*.md'],
  pinned: false, stale: false,
  ...over,
})

describe('SitesTab', () => {
  let listeners: Array<() => void>
  beforeEach(() => {
    listeners = []
    ;(window as unknown as { canvSites: unknown }).canvSites = {
      listWithStaleness: vi.fn(async () => [mkEntry()]),
      open: vi.fn(async () => ({ url: 'http://x' })),
      delete: vi.fn(async () => {}),
      setPinned: vi.fn(async (_id: string, _pinned: boolean) => mkEntry({ id: _id, pinned: _pinned })),
      update: vi.fn(),
      list: vi.fn(),
      register: vi.fn(),
      onRegistryChanged: vi.fn((cb: () => void) => { listeners.push(cb); return () => {} }),
    }
  })

  it('renders one row per site with the site name', async () => {
    render(<SitesTab onRegenerate={() => {}} />)
    await screen.findByText('Story Timeline')
  })

  it('shows a stale indicator when stale=true', async () => {
    ;(window.canvSites!.listWithStaleness as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mkEntry({ stale: true })])
    render(<SitesTab onRegenerate={() => {}} />)
    await waitFor(() => expect(screen.getByLabelText(/stale/i)).toBeInTheDocument())
  })

  it('clicking the row body opens the site', async () => {
    render(<SitesTab onRegenerate={() => {}} />)
    const row = await screen.findByRole('button', { name: /story timeline/i })
    fireEvent.click(row)
    await waitFor(() => expect(window.canvSites!.open).toHaveBeenCalledWith('a3f2'))
  })

  it('clicking the pin indicator toggles pinned state', async () => {
    render(<SitesTab onRegenerate={() => {}} />)
    await screen.findByText('Story Timeline')
    fireEvent.click(screen.getByRole('button', { name: /pin/i }))
    await waitFor(() => expect(window.canvSites!.setPinned).toHaveBeenCalledWith('a3f2', true))
  })

  it('overflow menu exposes Regenerate which fires onRegenerate with the prompt', async () => {
    const onRegenerate = vi.fn()
    render(<SitesTab onRegenerate={onRegenerate} />)
    await screen.findByText('Story Timeline')
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /regenerate/i }))
    expect(onRegenerate).toHaveBeenCalledWith('orig prompt')
  })

  it('overflow menu exposes Delete which calls canvSites.delete', async () => {
    render(<SitesTab onRegenerate={() => {}} />)
    await screen.findByText('Story Timeline')
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /delete/i }))
    await waitFor(() => expect(window.canvSites!.delete).toHaveBeenCalledWith('a3f2'))
  })

  it('refreshes when registryChanged fires', async () => {
    const list = window.canvSites!.listWithStaleness as ReturnType<typeof vi.fn>
    render(<SitesTab onRegenerate={() => {}} />)
    await screen.findByText('Story Timeline')
    list.mockResolvedValueOnce([mkEntry({ id: 'b9', name: 'Other' })])
    listeners.forEach((cb) => cb())
    await screen.findByText('Other')
  })

  it('Escape closes the overflow menu', async () => {
    render(<SitesTab onRegenerate={() => {}} />)
    await screen.findByText('Story Timeline')
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('clicking the More-actions trigger a second time closes the menu', async () => {
    render(<SitesTab onRegenerate={() => {}} />)
    await screen.findByText('Story Timeline')
    const trigger = screen.getByRole('button', { name: /more actions/i })
    fireEvent.mouseDown(trigger)
    fireEvent.click(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.mouseDown(trigger)
    fireEvent.click(trigger)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('empty state is shown when no entries', async () => {
    ;(window.canvSites!.listWithStaleness as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])
    render(<SitesTab onRegenerate={() => {}} />)
    await screen.findByText(/no sites yet/i)
  })
})
