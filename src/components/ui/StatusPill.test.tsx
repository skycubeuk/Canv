import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { StatusPill } from './StatusPill'

describe('StatusPill', () => {
  it('applies success classes for kind="success"', () => {
    const { getByText } = render(<StatusPill kind="success">ok</StatusPill>)
    const el = getByText('ok')
    expect(el.className).toContain('bg-success-soft')
    expect(el.className).toContain('text-success-fg')
    expect(el.className).toContain('border-success')
  })

  it('applies danger classes for kind="danger"', () => {
    const { getByText } = render(<StatusPill kind="danger">no</StatusPill>)
    const el = getByText('no')
    expect(el.className).toContain('bg-danger-soft')
    expect(el.className).toContain('text-danger-fg')
    expect(el.className).toContain('border-danger')
  })

  it('falls back to neutral chrome for kind="neutral"', () => {
    const { getByText } = render(<StatusPill kind="neutral">.</StatusPill>)
    const el = getByText('.')
    expect(el.className).toContain('bg-elev')
    expect(el.className).toContain('text-muted')
    expect(el.className).toContain('border-default')
  })

  it('applies warning classes for kind="warning"', () => {
    const { getByText } = render(<StatusPill kind="warning">!</StatusPill>)
    const el = getByText('!')
    expect(el.className).toContain('bg-warning-soft')
    expect(el.className).toContain('text-warning-fg')
    expect(el.className).toContain('border-warning')
  })

  it('applies info classes for kind="info"', () => {
    const { getByText } = render(<StatusPill kind="info">i</StatusPill>)
    const el = getByText('i')
    expect(el.className).toContain('bg-info-soft')
    expect(el.className).toContain('text-info-fg')
    expect(el.className).toContain('border-info')
  })
})
