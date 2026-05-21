import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { z } from 'zod'
import { JsonValueControl } from './JsonValueControl'

describe('JsonValueControl', () => {
  it('renders the current value pretty-printed', () => {
    render(<JsonValueControl
      label="args"
      value={['-y', '@modelcontextprotocol/server-filesystem', '/tmp']}
      onChange={() => {}}
      schema={z.array(z.string())}
    />)
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(JSON.parse(ta.value)).toEqual(['-y', '@modelcontextprotocol/server-filesystem', '/tmp'])
  })

  it('emits onChange with the parsed value when typed JSON parses + validates', () => {
    const onChange = vi.fn()
    render(<JsonValueControl label="args" value={[]} onChange={onChange} schema={z.array(z.string())} />)
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: '["alpha", "beta"]' } })
    expect(onChange).toHaveBeenCalledWith(['alpha', 'beta'])
  })

  it('does NOT emit onChange when the draft has invalid JSON; surfaces an error', () => {
    const onChange = vi.fn()
    render(<JsonValueControl label="args" value={['previous']} onChange={onChange} schema={z.array(z.string())} />)
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: '[invalid' } })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText(/invalid json/i)).toBeDefined()
    // Draft remains visible (not clobbered back to ['previous'])
    expect(ta.value).toBe('[invalid')
  })

  it('does NOT emit onChange when JSON parses but fails the schema', () => {
    const onChange = vi.fn()
    render(<JsonValueControl label="args" value={[]} onChange={onChange} schema={z.array(z.string())} />)
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: '[1, 2, 3]' } })   // numbers, not strings
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText(/expected string|invalid/i)).toBeDefined()
  })

  it('emits onChange(undefined) when the textarea is cleared', () => {
    const onChange = vi.fn()
    render(<JsonValueControl label="args" value={['x']} onChange={onChange} schema={z.array(z.string())} />)
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('renders records (object shape) too', () => {
    const onChange = vi.fn()
    render(<JsonValueControl
      label="env"
      value={{ FOO: 'bar' }}
      onChange={onChange}
      schema={z.record(z.string(), z.string())}
    />)
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(ta, { target: { value: '{"DEBUG": "1"}' } })
    expect(onChange).toHaveBeenCalledWith({ DEBUG: '1' })
  })
})
