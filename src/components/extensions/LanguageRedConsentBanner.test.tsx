import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { LanguageRedConsentBanner } from './LanguageRedConsentBanner'

afterEach(() => cleanup())

describe('LanguageRedConsentBanner', () => {
  it('warns that the extension runs code in the editor', () => {
    render(<LanguageRedConsentBanner extensionsHandled={['.tex', '.bib']} />)
    expect(screen.getByText(/runs code in your editor/i)).toBeTruthy()
  })
  it('lists the file extensions affected', () => {
    render(<LanguageRedConsentBanner extensionsHandled={['.tex', '.bib']} />)
    expect(screen.getByText(/\.tex, \.bib/)).toBeTruthy()
  })
})
