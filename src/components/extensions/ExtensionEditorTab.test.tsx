import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ExtensionEditorTab } from './ExtensionEditorTab'

class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
;(globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver

beforeEach(() => {
  cleanup()
  window.canvExtensions = {
    showFileInExtension: vi.fn().mockResolvedValue({ ok: true }),
    hideFileInExtension: vi.fn().mockResolvedValue(undefined),
  } as never
})
afterEach(() => cleanup())

describe('ExtensionEditorTab', () => {
  it('renders a div the size of its container', () => {
    const { container } = render(<ExtensionEditorTab extensionId="pdf-viewer" relPath="paper.pdf" mode="viewer" isActive={true} />)
    expect(container.querySelector('div')).toBeTruthy()
  })
  it('calls hideFileInExtension on unmount', () => {
    const spy = window.canvExtensions!.hideFileInExtension as ReturnType<typeof vi.fn>
    const { unmount } = render(<ExtensionEditorTab extensionId="pdf-viewer" relPath="paper.pdf" mode="viewer" isActive={true} />)
    unmount()
    expect(spy).toHaveBeenCalledWith('pdf-viewer', 'paper.pdf')
  })
  it('hides instead of showing when isActive is false', async () => {
    const showSpy = window.canvExtensions!.showFileInExtension as ReturnType<typeof vi.fn>
    const hideSpy = window.canvExtensions!.hideFileInExtension as ReturnType<typeof vi.fn>
    render(<ExtensionEditorTab extensionId="pdf-viewer" relPath="paper.pdf" mode="viewer" isActive={false} />)
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    expect(showSpy).not.toHaveBeenCalled()
    expect(hideSpy).toHaveBeenCalledWith('pdf-viewer', 'paper.pdf')
  })
})
