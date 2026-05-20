import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { z } from 'zod'
import { SchemaSettingsForm } from './SchemaSettingsForm'

const Schema = z.object({
  name: z.string().default('anon').meta({ ui: 'auto', section: 'identity', label: 'Name' }),
  age: z.number().int().min(0).max(120).default(0).meta({ ui: 'auto', section: 'identity', label: 'Age' }),
  active: z.boolean().default(true).meta({ ui: 'auto', section: 'flags', label: 'Active' }),
  // Hidden — never renders.
  internal: z.string().default('x').meta({ ui: 'auto', section: 'identity', label: 'Internal', hidden: true }),
  // No meta — never renders.
  legacy: z.string().default(''),
})

describe('SchemaSettingsForm', () => {
  it('renders one control per non-hidden auto-gen field grouped by section', () => {
    render(<SchemaSettingsForm schema={Schema} value={Schema.parse({})} onChange={() => {}} />)
    expect(screen.getByText('Name')).toBeDefined()
    expect(screen.getByText('Age')).toBeDefined()
    expect(screen.getByText('Active')).toBeDefined()
    expect(screen.queryByText('Internal')).toBeNull()
    expect(screen.queryByText('Legacy')).toBeNull()
  })

  it('emits onChange with a partial when a text field changes', () => {
    let captured: Partial<z.infer<typeof Schema>> | null = null
    render(<SchemaSettingsForm schema={Schema} value={Schema.parse({})} onChange={(p) => { captured = p }} />)
    const input = screen.getByDisplayValue('anon') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'ada' } })
    expect(captured).toEqual({ name: 'ada' })
  })

  it('honours sectionFilter', () => {
    render(
      <SchemaSettingsForm
        schema={Schema}
        value={Schema.parse({})}
        onChange={() => {}}
        sectionFilter={(s) => s === 'flags'}
      />,
    )
    expect(screen.queryByText('Name')).toBeNull()
    expect(screen.queryByText('Active')).toBeDefined()
  })
})
