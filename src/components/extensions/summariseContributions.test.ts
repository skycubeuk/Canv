import { describe, it, expect } from 'vitest'
import { summariseContributions } from './summariseContributions'

describe('summariseContributions', () => {
  it('returns empty string for empty input', () => {
    expect(summariseContributions([])).toBe('')
  })
  it('groups by type and pluralises', () => {
    expect(summariseContributions([
      { type: 'panel' }, { type: 'panel' }, { type: 'command' },
    ])).toBe('2 panels · 1 command')
  })
  it('appends extension lists for fileHandler / language', () => {
    expect(summariseContributions([
      { type: 'fileHandler', extensions: ['.pdf'] },
      { type: 'language', extensions: ['.tex', '.bib'] },
    ])).toBe('1 fileHandler (.pdf) · 1 language (.tex, .bib)')
  })
  it('skips entries without a type', () => {
    expect(summariseContributions([
      { type: 'panel' }, {}, { type: 'command' },
    ])).toBe('1 panel · 1 command')
  })
})
