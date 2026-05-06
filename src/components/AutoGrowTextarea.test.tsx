import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { AutoGrowTextarea } from './AutoGrowTextarea'

// jsdom doesn't lay out, so scrollHeight is always 0. We stub it per test
// to simulate content of various heights.
function stubScrollHeight(el: HTMLElement, value: number) {
  Object.defineProperty(el, 'scrollHeight', {
    configurable: true,
    get: () => value,
  })
}

// Stub getComputedStyle so the component sees deterministic line-height
// and padding regardless of the test environment's defaults.
function stubComputedStyle(lineHeightPx: number, paddingPx: number) {
  const original = window.getComputedStyle
  window.getComputedStyle = ((el: Element) => {
    const real = original(el)
    return new Proxy(real, {
      get(target, prop) {
        if (prop === 'lineHeight') return `${lineHeightPx}px`
        if (prop === 'paddingTop') return `${paddingPx}px`
        if (prop === 'paddingBottom') return `${paddingPx}px`
        return Reflect.get(target, prop)
      },
    })
  }) as typeof window.getComputedStyle
  return () => { window.getComputedStyle = original }
}

function Harness({ initial = '', minRows = 2, maxRows = 6 }: { initial?: string; minRows?: number; maxRows?: number }) {
  const [value, setValue] = useState(initial)
  return (
    <AutoGrowTextarea
      data-testid="ta"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      minRows={minRows}
      maxRows={maxRows}
    />
  )
}

describe('AutoGrowTextarea', () => {
  it('sets height to minRows × line-height when value is empty', () => {
    const restore = stubComputedStyle(20, 4)
    try {
      render(<Harness initial="" minRows={2} maxRows={6} />)
      const ta = screen.getByTestId('ta') as HTMLTextAreaElement
      stubScrollHeight(ta, 20) // jsdom default; doesn't matter — empty value forces min
      // Trigger an effect re-run by firing an input event with the same value.
      fireEvent.input(ta, { target: { value: '' } })
      // 2 × 20 + 2 × 4 = 48
      expect(ta.style.height).toBe('48px')
      expect(ta.style.overflowY).toBe('hidden')
    } finally {
      restore()
    }
  })

  it('grows height to fit content when scrollHeight is between min and max', () => {
    const restore = stubComputedStyle(20, 4)
    try {
      render(<Harness initial="" minRows={2} maxRows={6} />)
      const ta = screen.getByTestId('ta') as HTMLTextAreaElement
      // Simulate ~4 lines of content: 4 × 20 + 8 = 88
      stubScrollHeight(ta, 88)
      fireEvent.change(ta, { target: { value: 'a\nb\nc\nd' } })
      expect(ta.style.height).toBe('88px')
      expect(ta.style.overflowY).toBe('hidden')
    } finally {
      restore()
    }
  })

  it('caps height at maxRows and enables vertical scroll when content exceeds', () => {
    const restore = stubComputedStyle(20, 4)
    try {
      render(<Harness initial="" minRows={2} maxRows={6} />)
      const ta = screen.getByTestId('ta') as HTMLTextAreaElement
      // Simulate ~10 lines of content: 10 × 20 + 8 = 208 (over the 6-row cap of 128)
      stubScrollHeight(ta, 208)
      fireEvent.change(ta, { target: { value: 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj' } })
      // 6 × 20 + 2 × 4 = 128
      expect(ta.style.height).toBe('128px')
      expect(ta.style.overflowY).toBe('auto')
    } finally {
      restore()
    }
  })

  it('collapses back to min height when value is cleared', () => {
    const restore = stubComputedStyle(20, 4)
    try {
      render(<Harness initial="" minRows={2} maxRows={6} />)
      const ta = screen.getByTestId('ta') as HTMLTextAreaElement
      stubScrollHeight(ta, 88)
      fireEvent.change(ta, { target: { value: 'a\nb\nc\nd' } })
      expect(ta.style.height).toBe('88px')
      stubScrollHeight(ta, 20)
      fireEvent.change(ta, { target: { value: '' } })
      expect(ta.style.height).toBe('48px')
      expect(ta.style.overflowY).toBe('hidden')
    } finally {
      restore()
    }
  })

  it('forwards standard textarea props (placeholder, disabled, className)', () => {
    render(
      <AutoGrowTextarea
        data-testid="ta"
        value=""
        onChange={() => {}}
        placeholder="hello"
        disabled
        className="some-class"
      />
    )
    const ta = screen.getByTestId('ta') as HTMLTextAreaElement
    expect(ta.placeholder).toBe('hello')
    expect(ta.disabled).toBe(true)
    expect(ta.className).toContain('some-class')
  })
})
