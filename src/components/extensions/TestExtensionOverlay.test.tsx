import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { TestExtensionOverlay } from './TestExtensionOverlay'

beforeEach(() => {
  cleanup()
  window.localStorage.clear()
  window.canvExtensionsDev = {
    spawnTest: vi.fn().mockResolvedValue({ ok: true, id: 'hello-world' }),
    destroyTest: vi.fn().mockResolvedValue(undefined),
    setBounds: vi.fn().mockResolvedValue(undefined),
    onNotification: vi.fn(() => () => {}),
    onHostRequest: vi.fn(() => () => {}),
    hostReply: vi.fn(),
    fireEvent: vi.fn().mockResolvedValue(undefined),
  }
})

describe('TestExtensionOverlay', () => {
  it('renders nothing when the dev flag is off', () => {
    render(<TestExtensionOverlay getActiveEditor={() => null} activeMarkdownRel={null} />)
    expect(screen.queryByRole('button', { name: /test extension/i })).toBeNull()
  })

  it('renders the toggle when the dev flag is on', () => {
    window.localStorage.setItem('canv:extensions:devFlagOn', '1')
    render(<TestExtensionOverlay getActiveEditor={() => null} activeMarkdownRel={null} />)
    expect(screen.getByRole('button', { name: /show test extension/i })).toBeTruthy()
  })

  it('calls spawnTest when clicking show', async () => {
    window.localStorage.setItem('canv:extensions:devFlagOn', '1')
    render(<TestExtensionOverlay getActiveEditor={() => null} activeMarkdownRel={null} />)
    fireEvent.click(screen.getByRole('button', { name: /show test extension/i }))
    expect(window.canvExtensionsDev!.spawnTest).toHaveBeenCalledWith('hello-world', expect.any(Object))
  })
})
