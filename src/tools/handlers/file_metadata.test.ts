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

describe('file_metadata — body parsing', () => {
  it('populates base-tier fields for .md', async () => {
    const fs = makeMockFs({
      'a.md': {
        content: '---\ntitle: A\n---\n# Heading\n\nBody paragraph here.\n',
        mtimeMs: 1, size: 50, binary: false,
      },
    })
    const out = await fileMetadataTool.handler({ paths: ['a.md'] }, makeCtx({ fs }))
    const f = out.files[0]
    expect(f.path).toBe('a.md')
    expect(f.extension).toBe('.md')
    expect(f.frontmatter).toEqual({ title: 'A' })
    expect(f.headings).toEqual([{ level: 1, text: 'Heading', anchor: 'heading' }])
    expect(f.excerpt).toBe('Body paragraph here.')
    expect(f.words).toBe(4)
    expect(f.reading_time_min).toBe(1)
    expect(f.links).toBeUndefined()
  })

  it('treats .mdx the same as .md', async () => {
    const fs = makeMockFs({
      'a.mdx': { content: '# Hi\n\nWords here.\n', mtimeMs: 1, size: 18, binary: false },
    })
    const out = await fileMetadataTool.handler({ paths: ['a.mdx'] }, makeCtx({ fs }))
    expect(out.files[0].headings).toEqual([{ level: 1, text: 'Hi', anchor: 'hi' }])
    expect(out.files[0].words).toBe(3)
  })

  it('returns base fields only for non-markdown extensions', async () => {
    const fs = makeMockFs({
      'notes.txt': { content: 'whatever', mtimeMs: 5, size: 8, binary: false },
    })
    const out = await fileMetadataTool.handler({ paths: ['notes.txt'] }, makeCtx({ fs }))
    const f = out.files[0]
    expect(f.extension).toBe('.txt')
    expect(f.size_bytes).toBe(8)
    expect(f.words).toBeUndefined()
    expect(f.headings).toBeUndefined()
    expect(f.frontmatter).toBeUndefined()
    expect(f.error).toBeUndefined()
  })

  it('marks binary files with error="binary" and skips parsing', async () => {
    const fs = makeMockFs({
      'img.png': { content: '', mtimeMs: 1, size: 100, binary: true },
    })
    const out = await fileMetadataTool.handler({ paths: ['img.png'] }, makeCtx({ fs }))
    expect(out.files[0]).toEqual({
      path: 'img.png', error: 'binary',
      size_bytes: 100, mtime_ms: 1, binary: true, extension: '.png',
    })
  })

  it('sets truncated:true when the body exceeds 1 MB', async () => {
    const big = '# Title\n\n' + 'word '.repeat(300000) // ~1.5 MB
    const fs = makeMockFs({
      'big.md': { content: big, mtimeMs: 1, size: big.length, binary: false },
    })
    const out = await fileMetadataTool.handler({ paths: ['big.md'] }, makeCtx({ fs }))
    const f = out.files[0]
    expect(f.truncated).toBe(true)
    expect(f.words).toBeGreaterThan(0) // counts the truncated body
  })

  it('returns each opt-in field only when requested', async () => {
    const fs = makeMockFs({
      'a.md': {
        content: 'See [docs](u) and ![](p).\n\n- [ ] open\n- [x] done\n',
        mtimeMs: 1, size: 20, binary: false,
      },
    })
    const base = await fileMetadataTool.handler({ paths: ['a.md'] }, makeCtx({ fs }))
    expect(base.files[0].links).toBeUndefined()
    expect(base.files[0].todos).toBeUndefined()
    const opted = await fileMetadataTool.handler(
      { paths: ['a.md'], fields: ['links', 'todos'] },
      makeCtx({ fs }),
    )
    expect(opted.files[0].links).toEqual([{ text: 'docs', target: 'u' }])
    expect(opted.files[0].todos).toEqual({ open: 1, done: 1 })
  })

  it('ignores unknown opt-in field names', async () => {
    const fs = makeMockFs({ 'a.md': { content: '# x\n', mtimeMs: 1, size: 4, binary: false } })
    const out = await fileMetadataTool.handler(
      { paths: ['a.md'], fields: ['links', 'bogus'] },
      makeCtx({ fs }),
    )
    expect(out.files[0].links).toEqual([])
  })
})

describe('file_metadata — live editor buffer', () => {
  it('parses live editor content when the path is the active doc', async () => {
    const fs = makeMockFs({
      'active.md': {
        content: '# Disk version\n\nstale content.\n',
        mtimeMs: 9, size: 30, binary: false,
      },
    })
    const ctx = makeCtx({
      fs,
      activeDocPath: 'active.md',
      getEditorContent: (p) => (p === 'active.md' ? '# Live version\n\nfresh words.\n' : null),
    })
    const out = await fileMetadataTool.handler({ paths: ['active.md'] }, ctx)
    expect(out.files[0].headings).toEqual([{ level: 1, text: 'Live version', anchor: 'live-version' }])
    expect(out.files[0].excerpt).toBe('fresh words.')
  })

  it('falls back to disk when the active path differs', async () => {
    const fs = makeMockFs({
      'other.md': { content: '# Other\n', mtimeMs: 1, size: 8, binary: false },
    })
    const ctx = makeCtx({
      fs,
      activeDocPath: 'somewhere-else.md',
      getEditorContent: () => 'WRONG',
    })
    const out = await fileMetadataTool.handler({ paths: ['other.md'] }, ctx)
    expect(out.files[0].headings).toEqual([{ level: 1, text: 'Other', anchor: 'other' }])
  })
})
