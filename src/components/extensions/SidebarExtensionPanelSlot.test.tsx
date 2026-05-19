import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { SidebarExtensionPanelSlot } from './SidebarExtensionPanelSlot'

// jsdom doesn't implement ResizeObserver — provide a no-op stub.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver

beforeEach(() => {
  cleanup()
  window.canvExtensions = {
    listInstalled: vi.fn().mockResolvedValue([]) as never,
    install: vi.fn().mockResolvedValue({ ok: true }) as never,
    uninstall: vi.fn().mockResolvedValue(undefined) as never,
    setEnabled: vi.fn().mockResolvedValue(undefined) as never,
    setTrustedAt: vi.fn().mockResolvedValue(undefined) as never,
    getWorkspaceTrust: vi.fn().mockResolvedValue('untrusted') as never,
    setWorkspaceTrust: vi.fn().mockResolvedValue(undefined) as never,
    readSettings: vi.fn().mockResolvedValue({}) as never,
    writeSetting: vi.fn().mockResolvedValue(undefined) as never,
    readManifest: vi.fn().mockResolvedValue({}) as never,
    reload: vi.fn().mockResolvedValue(undefined) as never,
    pickInstallFolder: vi.fn().mockResolvedValue(null) as never,
    previewInstall: vi.fn().mockResolvedValue({ ok: false, errors: [] }) as never,
    readAllContributions: vi.fn().mockResolvedValue({ panels: [], fileHandlers: [], commands: [], menus: [], statusBarItems: [], languages: [] }) as never,
    onChanged: vi.fn(() => () => {}),
    onCrashed: vi.fn(() => () => {}),
    showPanelInSlot: vi.fn().mockResolvedValue({ ok: true }) as never,
    hidePanelInSlot: vi.fn().mockResolvedValue(undefined) as never,
    getFileHandlerDefaults: vi.fn().mockResolvedValue({}) as never,
    setFileHandlerDefault: vi.fn().mockResolvedValue(undefined) as never,
  }
})

afterEach(() => {
  cleanup()
})

describe('SidebarExtensionPanelSlot', () => {
  it('renders without crashing', () => {
    const { container } = render(<SidebarExtensionPanelSlot slotId="ext:my-ext:panel1" />)
    expect(container.querySelector('div')).toBeTruthy()
  })

  it('calls hidePanelInSlot on unmount', () => {
    const hideSpy = window.canvExtensions!.hidePanelInSlot as ReturnType<typeof vi.fn>
    const { unmount } = render(<SidebarExtensionPanelSlot slotId="ext:my-ext:panel1" />)
    unmount()
    expect(hideSpy).toHaveBeenCalledWith('ext:my-ext:panel1')
  })
})
