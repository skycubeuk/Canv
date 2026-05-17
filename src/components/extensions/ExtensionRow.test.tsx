import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ExtensionRow } from './ExtensionRow'

const ENTRY = {
  id: 'word-count',
  version: '1.0.0',
  manifestSha256: 'abc',
  installedAt: '2026-05-17T00:00:00Z',
  enabled: false,
  trustedAt: null as string | null,
}
const MANIFEST = { id: 'word-count', name: 'Word Count', version: '1.0.0', capabilities: ['activeDoc.read'], contributions: [] }

beforeEach(() => cleanup())

describe('ExtensionRow', () => {
  it('shows extension name and version', () => {
    render(<ExtensionRow entry={ENTRY} manifest={MANIFEST} running={false} expanded={false}
      onToggleEnabled={() => {}} onSetTrusted={() => {}} onUninstall={() => {}} onReload={() => {}} onExpand={() => {}} />)
    expect(screen.getByText(/Word Count/)).toBeTruthy()
    expect(screen.getByText(/1\.0\.0/)).toBeTruthy()
  })

  it('shows "needs trust" badge when trustedAt is null', () => {
    render(<ExtensionRow entry={ENTRY} manifest={MANIFEST} running={false} expanded={false}
      onToggleEnabled={() => {}} onSetTrusted={() => {}} onUninstall={() => {}} onReload={() => {}} onExpand={() => {}} />)
    expect(screen.getByText(/needs trust/i)).toBeTruthy()
  })

  it('enable toggle is disabled when needs trust', () => {
    render(<ExtensionRow entry={ENTRY} manifest={MANIFEST} running={false} expanded={false}
      onToggleEnabled={() => {}} onSetTrusted={() => {}} onUninstall={() => {}} onReload={() => {}} onExpand={() => {}} />)
    expect((screen.getByRole('switch', { name: /enabled/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('enable toggle calls onToggleEnabled when trusted+clicked', () => {
    const trusted = { ...ENTRY, trustedAt: '2026-05-17T00:00:00Z', enabled: true }
    const toggle = vi.fn()
    render(<ExtensionRow entry={trusted} manifest={MANIFEST} running={true} expanded={false}
      onToggleEnabled={toggle} onSetTrusted={() => {}} onUninstall={() => {}} onReload={() => {}} onExpand={() => {}} />)
    fireEvent.click(screen.getByRole('switch', { name: /enabled/i }))
    expect(toggle).toHaveBeenCalledWith(false)
  })

  it('shows "active" badge when running and not crashed', () => {
    const trusted = { ...ENTRY, trustedAt: '2026-05-17T00:00:00Z', enabled: true }
    render(<ExtensionRow entry={trusted} manifest={MANIFEST} running={true} expanded={false}
      onToggleEnabled={() => {}} onSetTrusted={() => {}} onUninstall={() => {}} onReload={() => {}} onExpand={() => {}} />)
    expect(screen.getByText(/^active$/i)).toBeTruthy()
  })

  it('shows "crashed" badge when crashed', () => {
    const trusted = { ...ENTRY, trustedAt: '2026-05-17T00:00:00Z', enabled: true }
    render(<ExtensionRow entry={trusted} manifest={MANIFEST} running={false} crashed={true} expanded={false}
      onToggleEnabled={() => {}} onSetTrusted={() => {}} onUninstall={() => {}} onReload={() => {}} onExpand={() => {}} />)
    expect(screen.getByText(/crashed/i)).toBeTruthy()
  })

  it('opens actions menu when ⋯ clicked', () => {
    render(<ExtensionRow entry={ENTRY} manifest={MANIFEST} running={false} expanded={false}
      onToggleEnabled={() => {}} onSetTrusted={() => {}} onUninstall={() => {}} onReload={() => {}} onExpand={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('Trust action calls onSetTrusted with ISO timestamp', () => {
    const onSetTrusted = vi.fn()
    render(<ExtensionRow entry={ENTRY} manifest={MANIFEST} running={false} expanded={false}
      onToggleEnabled={() => {}} onSetTrusted={onSetTrusted} onUninstall={() => {}} onReload={() => {}} onExpand={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }))
    fireEvent.click(screen.getByRole('button', { name: /trust this extension/i }))
    expect(onSetTrusted).toHaveBeenCalledTimes(1)
    expect(typeof onSetTrusted.mock.calls[0][0]).toBe('string')
    expect(onSetTrusted.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('expand button calls onExpand toggle', () => {
    const onExpand = vi.fn()
    render(<ExtensionRow entry={ENTRY} manifest={MANIFEST} running={false} expanded={false}
      onToggleEnabled={() => {}} onSetTrusted={() => {}} onUninstall={() => {}} onReload={() => {}} onExpand={onExpand} />)
    fireEvent.click(screen.getByRole('button', { name: /expand|collapse/i }))
    expect(onExpand).toHaveBeenCalledWith(true)
  })
})
