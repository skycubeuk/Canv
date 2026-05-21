import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { z } from 'zod'
import { SchemaSettingsForm } from './SchemaSettingsForm'
import { SettingsSchema } from '../../hooks/settingsSchema'

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

  // End-to-end regression test for the mcpServers render path. Exercises
  // ArrayOfObjectsControl + DiscriminatedUnionControl + makeDefault against the
  // real SettingsSchema — guards against silent breakage if Zod patches the
  // _def shape (e.g. moves `_def.discriminator` or `_def.options`).
  it('renders the mcpServers array + discriminated union and switches variants', () => {
    // The renderer is typed against z.infer<typeof SettingsSchema>, which is
    // structurally wider than the exported `Settings` (postProcess narrows
    // perAgentModel / pricingOverrides). Type the spy against the raw inferred
    // shape so this test matches the renderer's prop type exactly.
    type RawSettings = z.infer<typeof SettingsSchema>
    const onChange = vi.fn<(patch: Partial<RawSettings>) => void>()
    const initial = SettingsSchema.parse({
      mcpServers: [{ name: 'fs', transport: 'stdio', command: 'mcp-server-filesystem' }],
    })

    render(
      <SchemaSettingsForm
        schema={SettingsSchema}
        value={initial}
        onChange={onChange}
        sectionFilter={(s) => s === 'mcp'}
      />,
    )

    // meta.itemLabel surfaces the row label.
    const rowToggle = screen.getByText('fs')
    expect(rowToggle).toBeDefined()

    // Collapsed — no transport tabs / command input yet.
    expect(screen.queryByRole('tab', { name: 'stdio' })).toBeNull()

    // Expand the row.
    fireEvent.click(rowToggle)

    // stdio variant is active and its command field is visible.
    const stdioTab = screen.getByRole('tab', { name: 'stdio' })
    const httpTab = screen.getByRole('tab', { name: 'http' })
    expect(stdioTab.getAttribute('aria-selected')).toBe('true')
    expect(httpTab.getAttribute('aria-selected')).toBe('false')
    expect(screen.getByDisplayValue('mcp-server-filesystem')).toBeDefined()

    // Switch to http: the stdio-only `command` field should drop out of the
    // emitted patch, `name` should carry over, and `transport` should flip.
    fireEvent.click(httpTab)
    const lastCall = onChange.mock.calls.at(-1)?.[0]
    expect(lastCall).toBeDefined()
    expect(lastCall?.mcpServers).toHaveLength(1)
    const switched = lastCall?.mcpServers?.[0] as Record<string, unknown>
    expect(switched.transport).toBe('http')
    expect(switched.name).toBe('fs')
    expect('command' in switched).toBe(false)
  })
})
