import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppearanceSection } from './AppearanceSection'

const baseSettings = {
  theme: 'canv-dark' as const,
  fontSize: 16,
  chatFontSize: 14,
  aiChangesDisplay: 'both' as const,
}

describe('AppearanceSection', () => {
  it('renders the theme dropdown', () => {
    const onUpdate = vi.fn()
    render(<AppearanceSection settings={baseSettings} onUpdate={onUpdate} />)
    expect(screen.getByRole('combobox', { name: /theme/i })).toBeTruthy()
  })

  it('theme dropdown includes "Match system" option', () => {
    const onUpdate = vi.fn()
    render(<AppearanceSection settings={baseSettings} onUpdate={onUpdate} />)
    const select = screen.getByRole('combobox', { name: /theme/i })
    expect(select.innerHTML).toContain('Match system')
  })

  it('changing the theme dropdown fires onUpdate', () => {
    const onUpdate = vi.fn()
    render(<AppearanceSection settings={baseSettings} onUpdate={onUpdate} />)
    const select = screen.getByRole('combobox', { name: /theme/i })
    fireEvent.change(select, { target: { value: 'dracula' } })
    expect(onUpdate).toHaveBeenCalledWith({ theme: 'dracula' })
  })

  it('changing the font-size slider fires onUpdate', () => {
    const onUpdate = vi.fn()
    render(<AppearanceSection settings={baseSettings} onUpdate={onUpdate} />)
    const slider = screen.getByLabelText(/^font size/i)
    fireEvent.change(slider, { target: { value: '18' } })
    expect(onUpdate).toHaveBeenCalledWith({ fontSize: 18 })
  })

  it('changing the chat-font-size slider fires onUpdate', () => {
    const onUpdate = vi.fn()
    render(<AppearanceSection settings={baseSettings} onUpdate={onUpdate} />)
    const slider = screen.getByLabelText(/chat font size/i)
    fireEvent.change(slider, { target: { value: '18' } })
    expect(onUpdate).toHaveBeenCalledWith({ chatFontSize: 18 })
  })

  it('renders the AI changes dropdown with the current value selected', () => {
    const onUpdate = vi.fn()
    render(<AppearanceSection settings={{ ...baseSettings, aiChangesDisplay: 'panel' }} onUpdate={onUpdate} />)
    const select = screen.getByLabelText(/show ai changes/i) as HTMLSelectElement
    expect(select.value).toBe('panel')
  })

  it('changing the AI changes dropdown fires onUpdate with the new value', () => {
    const onUpdate = vi.fn()
    render(<AppearanceSection settings={baseSettings} onUpdate={onUpdate} />)
    const select = screen.getByLabelText(/show ai changes/i) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'inline' } })
    expect(onUpdate).toHaveBeenCalledWith({ aiChangesDisplay: 'inline' })
  })
})
