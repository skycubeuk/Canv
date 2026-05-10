import { describe, it, expect } from 'vitest'
import { parseMarkdownMeta } from './markdown_meta'

describe('parseMarkdownMeta — frontmatter', () => {
  it('parses well-formed YAML frontmatter and strips it from body', () => {
    const src = '---\ntitle: Hello\ntags: [a, b]\n---\nBody starts here.'
    const m = parseMarkdownMeta(src, { fields: [] })
    expect(m.frontmatter).toEqual({ title: 'Hello', tags: ['a', 'b'] })
    expect(m.bodyAfterFrontmatter).toBe('Body starts here.')
  })

  it('returns null frontmatter when absent', () => {
    const m = parseMarkdownMeta('No frontmatter here.', { fields: [] })
    expect(m.frontmatter).toBeNull()
    expect(m.bodyAfterFrontmatter).toBe('No frontmatter here.')
  })

  it('returns null frontmatter when malformed', () => {
    const src = '---\ntitle: [unterminated\n---\nbody'
    const m = parseMarkdownMeta(src, { fields: [] })
    expect(m.frontmatter).toBeNull()
    // Malformed frontmatter is still stripped — we found the fences:
    expect(m.bodyAfterFrontmatter).toBe('body')
  })

  it('does not treat a --- in the middle of a file as frontmatter', () => {
    const src = 'Intro paragraph.\n\n---\ntitle: Not frontmatter\n---\nMore.'
    const m = parseMarkdownMeta(src, { fields: [] })
    expect(m.frontmatter).toBeNull()
    expect(m.bodyAfterFrontmatter).toBe(src)
  })
})
