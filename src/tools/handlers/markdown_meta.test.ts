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

  it('handles a frontmatter block that ends at EOF without a trailing newline', () => {
    const src = '---\ntitle: A\n---'
    const m = parseMarkdownMeta(src, { fields: [] })
    expect(m.frontmatter).toEqual({ title: 'A' })
    expect(m.bodyAfterFrontmatter).toBe('')
  })
})

describe('parseMarkdownMeta — counts', () => {
  it('counts words, chars, lines, paragraphs on a simple body', () => {
    const src = 'First paragraph here.\n\nSecond paragraph has four words.\n'
    const m = parseMarkdownMeta(src, { fields: [] })
    expect(m.chars).toBe(src.length)
    expect(m.lines).toBe(4) // 3 newlines + 1
    expect(m.paragraphs).toBe(2)
    expect(m.words).toBe(8) // 3 + 5
    expect(m.readingTimeMin).toBe(1)
  })

  it('excludes frontmatter from counts', () => {
    const src = '---\ntitle: Ignore me totally\n---\nOnly three words.\n'
    const m = parseMarkdownMeta(src, { fields: [] })
    expect(m.words).toBe(3)
  })

  it('excludes fenced and inline code from word count', () => {
    const src = 'before `code in line` after\n\n```js\nconsole.log("x")\n```\nend.\n'
    const m = parseMarkdownMeta(src, { fields: [] })
    // "before after end." — 3 words. Fence body and inline code drop out.
    expect(m.words).toBe(3)
  })

  it('returns 0 readingTimeMin when words is 0, else >= 1', () => {
    expect(parseMarkdownMeta('', { fields: [] }).readingTimeMin).toBe(0)
    expect(parseMarkdownMeta('one two three', { fields: [] }).readingTimeMin).toBe(1)
    const longBody = Array(450).fill('word').join(' ')
    expect(parseMarkdownMeta(longBody, { fields: [] }).readingTimeMin).toBe(2)
  })
})
