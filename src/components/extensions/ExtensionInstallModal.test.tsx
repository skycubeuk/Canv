import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ExtensionInstallModal } from './ExtensionInstallModal'

const MANIFEST = {
  id: 'word-count',
  name: 'Word Count',
  version: '1.0.0',
  description: 'Counts words by chapter.',
  author: 'AI',
  capabilities: ['activeDoc.read', 'ai', 'net'],
  network: ['api.openai.com', 'wttr.in'],
  contributions: [],
  builderPrompt: 'count words by chapter',
}

beforeEach(() => cleanup())

describe('ExtensionInstallModal', () => {
  it('shows manifest name + version + description', () => {
    render(<ExtensionInstallModal sourceFolder="/x" manifest={MANIFEST}
      onCancel={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText(/Install "Word Count"/)).toBeTruthy()
    expect(screen.getByText(/1\.0\.0/)).toBeTruthy()
    expect(screen.getByText(/Counts words by chapter/)).toBeTruthy()
  })

  it('renders each capability as a chip', () => {
    render(<ExtensionInstallModal sourceFolder="/x" manifest={MANIFEST}
      onCancel={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText('activeDoc.read')).toBeTruthy()
    expect(screen.getByText('ai')).toBeTruthy()
    expect(screen.getByText('net')).toBeTruthy()
  })

  it('renders each network origin as a chip', () => {
    render(<ExtensionInstallModal sourceFolder="/x" manifest={MANIFEST}
      onCancel={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText('api.openai.com')).toBeTruthy()
    expect(screen.getByText('wttr.in')).toBeTruthy()
  })

  it('renders builder prompt when present', () => {
    render(<ExtensionInstallModal sourceFolder="/x" manifest={MANIFEST}
      onCancel={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText(/count words by chapter/)).toBeTruthy()
  })

  it('shows contribution summary', () => {
    const m = { ...MANIFEST, contributions: [
      { type: 'panel' }, { type: 'panel' }, { type: 'command' },
    ] }
    render(<ExtensionInstallModal sourceFolder="/x" manifest={m}
      onCancel={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText(/2 panels · 1 command/)).toBeTruthy()
  })

  it('shows "No UI contributions" when manifest.contributions is empty', () => {
    render(<ExtensionInstallModal sourceFolder="/x" manifest={MANIFEST}
      onCancel={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText('No UI contributions')).toBeTruthy()
  })

  it('renders source folder path', () => {
    render(<ExtensionInstallModal sourceFolder="/path/to/ext" manifest={MANIFEST}
      onCancel={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText('/path/to/ext')).toBeTruthy()
  })

  it('Cancel button calls onCancel', () => {
    const onCancel = vi.fn()
    render(<ExtensionInstallModal sourceFolder="/x" manifest={MANIFEST}
      onCancel={onCancel} onConfirm={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('Install button calls onConfirm', () => {
    const onConfirm = vi.fn()
    render(<ExtensionInstallModal sourceFolder="/x" manifest={MANIFEST}
      onCancel={() => {}} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: /install to this workspace/i }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('Escape calls onCancel', () => {
    const onCancel = vi.fn()
    render(<ExtensionInstallModal sourceFolder="/x" manifest={MANIFEST}
      onCancel={onCancel} onConfirm={() => {}} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })

  it('handles empty capabilities + network gracefully', () => {
    const minimalManifest = { ...MANIFEST, capabilities: [], network: [] }
    render(<ExtensionInstallModal sourceFolder="/x" manifest={minimalManifest}
      onCancel={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText(/No capabilities requested/i)).toBeTruthy()
    expect(screen.getByText(/No network access requested/i)).toBeTruthy()
  })
})
