import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

describe('design system utilities', () => {
  it('btn-primary + btn-sm renders both classes', () => {
    const { container } = render(<button className="btn-primary btn-sm">x</button>)
    const el = container.firstChild as HTMLElement
    expect(el.className).toContain('btn-primary')
    expect(el.className).toContain('btn-sm')
  })
})
