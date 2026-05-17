import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { ExtensionsTab } from './ExtensionsTab'

const ENTRY = { id: 'a', version: '1.0.0', manifestSha256: 'h', installedAt: 'x', enabled: false, trustedAt: null as string | null }
const MANIFEST = { id: 'a', name: 'Alpha', version: '1.0.0', capabilities: [], contributions: [], settings: [] }

function setMockCanvExt(overrides: Partial<NonNullable<typeof window.canvExtensions>> = {}) {
  const base: NonNullable<typeof window.canvExtensions> = {
    listInstalled: vi.fn().mockResolvedValue([ENTRY]) as never,
    readManifest: vi.fn().mockResolvedValue(MANIFEST) as never,
    getWorkspaceTrust: vi.fn().mockResolvedValue('untrusted') as never,
    setWorkspaceTrust: vi.fn().mockResolvedValue(undefined) as never,
    setEnabled: vi.fn().mockResolvedValue(undefined) as never,
    setTrustedAt: vi.fn().mockResolvedValue(undefined) as never,
    uninstall: vi.fn().mockResolvedValue(undefined) as never,
    reload: vi.fn().mockResolvedValue(undefined) as never,
    readSettings: vi.fn().mockResolvedValue({}) as never,
    writeSetting: vi.fn().mockResolvedValue(undefined) as never,
    install: vi.fn().mockResolvedValue({ ok: true, id: 'a' }) as never,
    pickInstallFolder: vi.fn().mockResolvedValue('/some/folder') as never,
    previewInstall: vi.fn().mockResolvedValue({
      ok: true,
      manifest: { id: 'a', name: 'Alpha', version: '1.0.0', capabilities: [], network: [], contributions: [] },
    }) as never,
    onChanged: vi.fn(() => () => {}),
    onCrashed: vi.fn(() => () => {}),
  }
  window.canvExtensions = { ...base, ...overrides }
}

beforeEach(() => {
  cleanup()
  setMockCanvExt()
})

describe('ExtensionsTab', () => {
  it('shows the workspace trust banner when untrusted with extensions', async () => {
    render(<ExtensionsTab />)
    await waitFor(() => expect(screen.getByText(/this workspace contains 1 extension/i)).toBeTruthy())
  })

  it('renders one row per installed extension after loading', async () => {
    render(<ExtensionsTab />)
    await waitFor(() => expect(screen.getByText('Alpha')).toBeTruthy())
  })

  it('shows empty state when no extensions installed', async () => {
    ;(window.canvExtensions!.listInstalled as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])
    render(<ExtensionsTab />)
    await waitFor(() => expect(screen.getByText(/no extensions installed/i)).toBeTruthy())
  })

  it('Install from folder button calls pickInstallFolder + install', async () => {
    render(<ExtensionsTab />)
    await waitFor(() => expect(screen.getByText(/install from folder/i)).toBeTruthy())
    ;(screen.getByRole('button', { name: /install from folder/i }) as HTMLButtonElement).click()
    await waitFor(() => expect(window.canvExtensions!.pickInstallFolder).toHaveBeenCalled())
  })
})
