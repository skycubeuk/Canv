import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { TrustWorkspaceBanner } from './TrustWorkspaceBanner'

beforeEach(() => {
  cleanup()
  window.canvExtensions = {
    listInstalled: vi.fn().mockResolvedValue([]) as never,
    getWorkspaceTrust: vi.fn().mockResolvedValue('untrusted') as never,
    setWorkspaceTrust: vi.fn().mockResolvedValue(undefined) as never,
    onChanged: vi.fn(() => () => {}),
    readManifest: vi.fn() as never,
    install: vi.fn() as never,
    uninstall: vi.fn() as never,
    setEnabled: vi.fn() as never,
    setTrustedAt: vi.fn() as never,
    readSettings: vi.fn() as never,
    writeSetting: vi.fn() as never,
    reload: vi.fn() as never,
    pickInstallFolder: vi.fn() as never,
    onCrashed: vi.fn(() => () => {}),
  }
})

describe('TrustWorkspaceBanner', () => {
  it('renders nothing when no extensions are installed', async () => {
    render(<TrustWorkspaceBanner onReviewInSidebar={() => {}} />)
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('renders nothing when workspace is already trusted', async () => {
    ;(window.canvExtensions!.listInstalled as ReturnType<typeof vi.fn>).mockResolvedValue([{}])
    ;(window.canvExtensions!.getWorkspaceTrust as ReturnType<typeof vi.fn>).mockResolvedValue('trusted')
    render(<TrustWorkspaceBanner onReviewInSidebar={() => {}} />)
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('renders banner with count when untrusted with extensions', async () => {
    ;(window.canvExtensions!.listInstalled as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'a' }, { id: 'b' }])
    render(<TrustWorkspaceBanner onReviewInSidebar={() => {}} />)
    await waitFor(() => expect(screen.getByText(/contains 2 extensions/i)).toBeTruthy())
  })

  it('Trust button calls setWorkspaceTrust("trusted")', async () => {
    ;(window.canvExtensions!.listInstalled as ReturnType<typeof vi.fn>).mockResolvedValue([{}])
    render(<TrustWorkspaceBanner onReviewInSidebar={() => {}} />)
    await waitFor(() => screen.getByRole('button', { name: /trust this workspace/i }))
    fireEvent.click(screen.getByRole('button', { name: /trust this workspace/i }))
    expect(window.canvExtensions!.setWorkspaceTrust).toHaveBeenCalledWith('trusted')
  })

  it('Review button calls onReviewInSidebar callback', async () => {
    const onReview = vi.fn()
    ;(window.canvExtensions!.listInstalled as ReturnType<typeof vi.fn>).mockResolvedValue([{}])
    render(<TrustWorkspaceBanner onReviewInSidebar={onReview} />)
    await waitFor(() => screen.getByRole('button', { name: /review in sidebar/i }))
    fireEvent.click(screen.getByRole('button', { name: /review in sidebar/i }))
    expect(onReview).toHaveBeenCalled()
  })
})
