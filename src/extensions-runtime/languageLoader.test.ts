import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadLanguageFor } from './languageLoader'

const EMPTY = { panels: [], fileHandlers: [], commands: [], menus: [], statusBarItems: [], languages: [] }

beforeEach(() => {
  window.canvExtensions = {
    readAllContributions: vi.fn().mockResolvedValue({ ...EMPTY, languages: [{ extensionId: 'tex-lang', extensions: ['.tex'], entry: 'language/tex.js' }] }),
  } as never
})

describe('loadLanguageFor', () => {
  it('returns null when no extension claims the file extension', async () => {
    const result = await loadLanguageFor('notes.md', { fetcher: async () => null })
    expect(result).toBeNull()
  })

  it('imports the entry and returns its LanguageSupport instance, injecting deps', async () => {
    const seenDeps: unknown[] = []
    const fetcher = vi.fn().mockResolvedValue({
      default: (deps: unknown) => { seenDeps.push(deps); return { __marker: 'tex-language-support' } },
    })
    const result = await loadLanguageFor('paper.tex', { fetcher })
    expect(fetcher).toHaveBeenCalledWith('canv-extension://tex-lang/language/tex.js')
    expect(result).toMatchObject({ __marker: 'tex-language-support' })
    expect(seenDeps).toHaveLength(1)
    expect(seenDeps[0]).toHaveProperty('LanguageSupport')
    expect(seenDeps[0]).toHaveProperty('StreamLanguage')
  })

  it('returns null on import failure', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('module not found'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await loadLanguageFor('paper.tex', { fetcher })
    expect(result).toBeNull()
    warn.mockRestore()
  })

  it('returns null when the entry has no default export function', async () => {
    const fetcher = vi.fn().mockResolvedValue({ default: 'not a function' })
    const result = await loadLanguageFor('paper.tex', { fetcher })
    expect(result).toBeNull()
  })
})
