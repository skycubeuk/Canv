import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ExtensionSettingsForm } from './ExtensionSettingsForm'

type SettingDef =
  | { key: string; type: 'string'; default?: string; label?: string }
  | { key: string; type: 'number'; default?: number; label?: string; min?: number; max?: number }
  | { key: string; type: 'boolean'; default?: boolean; label?: string }
  | { key: string; type: 'enum'; options: string[]; default?: string; label?: string }
  | { key: string; type: 'color'; default?: string; label?: string }
  | { key: string; type: 'multiline'; default?: string; label?: string }
  | { key: string; type: 'path'; default?: string; label?: string }

const SETTINGS: SettingDef[] = [
  { key: 'target', type: 'number', default: 50000, min: 0, label: 'Target' },
  { key: 'show', type: 'boolean', default: true, label: 'Show chart' },
  { key: 'mode', type: 'enum', options: ['save', 'edit', 'manual'], default: 'save', label: 'Refresh on' },
]

beforeEach(() => cleanup())

describe('ExtensionSettingsForm', () => {
  it('renders each setting with its label and current value', () => {
    render(<ExtensionSettingsForm settings={SETTINGS} values={{ target: 100, show: false, mode: 'edit' }} onChange={() => {}} />)
    expect((screen.getByLabelText(/target/i) as HTMLInputElement).value).toBe('100')
    expect((screen.getByLabelText(/show chart/i) as HTMLInputElement).checked).toBe(false)
    expect((screen.getByLabelText(/refresh on/i) as HTMLSelectElement).value).toBe('edit')
  })

  it('falls back to default when value is missing', () => {
    render(<ExtensionSettingsForm settings={SETTINGS} values={{}} onChange={() => {}} />)
    expect((screen.getByLabelText(/target/i) as HTMLInputElement).value).toBe('50000')
    expect((screen.getByLabelText(/show chart/i) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText(/refresh on/i) as HTMLSelectElement).value).toBe('save')
  })

  it('emits change on boolean toggle (immediate)', () => {
    const cb = vi.fn()
    render(<ExtensionSettingsForm settings={SETTINGS} values={{}} onChange={cb} />)
    fireEvent.click(screen.getByLabelText(/show chart/i))
    expect(cb).toHaveBeenCalledWith('show', false)
  })

  it('emits change on enum select (immediate)', () => {
    const cb = vi.fn()
    render(<ExtensionSettingsForm settings={SETTINGS} values={{}} onChange={cb} />)
    fireEvent.change(screen.getByLabelText(/refresh on/i), { target: { value: 'manual' } })
    expect(cb).toHaveBeenCalledWith('mode', 'manual')
  })

  it('emits change on number commit (blur)', () => {
    const cb = vi.fn()
    render(<ExtensionSettingsForm settings={SETTINGS} values={{}} onChange={cb} />)
    const input = screen.getByLabelText(/target/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: '12345' } })
    expect(cb).not.toHaveBeenCalled()   // not yet
    fireEvent.blur(input)
    expect(cb).toHaveBeenCalledWith('target', 12345)
  })

  it('handles string and multiline settings', () => {
    const settings: SettingDef[] = [
      { key: 's', type: 'string', default: 'a', label: 'Str' },
      { key: 'm', type: 'multiline', default: 'b', label: 'Multi' },
    ]
    const cb = vi.fn()
    render(<ExtensionSettingsForm settings={settings} values={{}} onChange={cb} />)
    const s = screen.getByLabelText(/^str$/i) as HTMLInputElement
    fireEvent.change(s, { target: { value: 'new' } })
    fireEvent.blur(s)
    expect(cb).toHaveBeenCalledWith('s', 'new')
  })

  it('renders nothing when settings is empty', () => {
    const { container } = render(<ExtensionSettingsForm settings={[]} values={{}} onChange={() => {}} />)
    expect(container.textContent ?? '').toMatch(/no settings|^$/i)
  })
})
