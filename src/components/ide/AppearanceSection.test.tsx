import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppearanceSection } from './AppearanceSection'

const baseSettings = {
  theme: 'dark' as const,
  accent: '#6366f1',
  fontSize: 16,
}

describe('AppearanceSection', () => {
  it('renders the six accent swatches in palette order', () => {
    const onUpdate = vi.fn()
    render(<AppearanceSection settings={baseSettings} onUpdate={onUpdate} />)
    const buttons = screen.getAllByRole('button', { name: /accent/i })
    expect(buttons.map((b) => b.getAttribute('data-accent'))).toEqual([
      '#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#a78bfa', '#e2e8f0',
    ])
  })

  it('clicking a swatch fires onUpdate with the hex', () => {
    const onUpdate = vi.fn()
    render(<AppearanceSection settings={baseSettings} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByRole('button', { name: /accent emerald/i }))
    expect(onUpdate).toHaveBeenCalledWith({ accent: '#10b981' })
  })

  it('selecting a theme radio fires onUpdate', () => {
    const onUpdate = vi.fn()
    render(<AppearanceSection settings={baseSettings} onUpdate={onUpdate} />)
    fireEvent.click(screen.getByLabelText('Light'))
    expect(onUpdate).toHaveBeenCalledWith({ theme: 'light' })
  })

  it('changing the font-size slider fires onUpdate', () => {
    const onUpdate = vi.fn()
    render(<AppearanceSection settings={baseSettings} onUpdate={onUpdate} />)
    const slider = screen.getByLabelText(/font size/i)
    fireEvent.change(slider, { target: { value: '18' } })
    expect(onUpdate).toHaveBeenCalledWith({ fontSize: 18 })
  })
})
