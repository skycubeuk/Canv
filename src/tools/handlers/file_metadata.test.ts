import { describe, it, expect } from 'vitest'
import { fileMetadataTool } from './file_metadata'
import { makeMockFs, makeCtx } from '../../test/fixtures'

describe('file_metadata — input validation', () => {
  it('rejects when paths is missing or not an array', async () => {
    const ctx = makeCtx({ fs: makeMockFs({}) })
    await expect(fileMetadataTool.handler({} as never, ctx)).rejects.toThrow(/paths/i)
    await expect(fileMetadataTool.handler({ paths: 'a.md' } as never, ctx)).rejects.toThrow(/paths/i)
  })

  it('rejects an empty paths array', async () => {
    const ctx = makeCtx({ fs: makeMockFs({}) })
    await expect(fileMetadataTool.handler({ paths: [] }, ctx)).rejects.toThrow(/at least one/i)
  })

  it('rejects more than 200 paths', async () => {
    const ctx = makeCtx({ fs: makeMockFs({}) })
    const paths = Array.from({ length: 201 }, (_, i) => `f${i}.md`)
    await expect(fileMetadataTool.handler({ paths }, ctx)).rejects.toThrow(/200/)
  })

  it('returns a not_found error per missing file without failing the call', async () => {
    const fs = makeMockFs({ 'real.md': { content: '# hi', mtimeMs: 1, size: 4, binary: false } })
    const out = await fileMetadataTool.handler({ paths: ['real.md', 'nope.md'] }, makeCtx({ fs }))
    expect(out.files).toHaveLength(2)
    expect(out.files[0].path).toBe('real.md')
    expect(out.files[0].error).toBeUndefined()
    expect(out.files[1]).toEqual({ path: 'nope.md', error: 'not_found' })
  })

  it('de-duplicates repeated paths, preserving order of first occurrence', async () => {
    const fs = makeMockFs({ 'a.md': { content: 'x', mtimeMs: 1, size: 1, binary: false } })
    const out = await fileMetadataTool.handler({ paths: ['a.md', 'a.md'] }, makeCtx({ fs }))
    expect(out.files).toHaveLength(1)
    expect(out.files[0].path).toBe('a.md')
  })

  it('returns not_a_file when path resolves to a directory', async () => {
    const fs = makeMockFs({ 'folder/inside.md': { content: 'x', mtimeMs: 1, size: 1, binary: false } })
    const out = await fileMetadataTool.handler({ paths: ['folder'] }, makeCtx({ fs }))
    expect(out.files).toEqual([{ path: 'folder', error: 'not_a_file' }])
  })
})
