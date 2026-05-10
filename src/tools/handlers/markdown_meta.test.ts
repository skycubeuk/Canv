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

describe('parseMarkdownMeta — headings', () => {
  it('extracts headings with level, text, and slug anchor', () => {
    const src = '# Top\n\n## A section\n\n### Sub-section!\n\nbody'
    const m = parseMarkdownMeta(src, { fields: [] })
    expect(m.headings).toEqual([
      { level: 1, text: 'Top', anchor: 'top' },
      { level: 2, text: 'A section', anchor: 'a-section' },
      { level: 3, text: 'Sub-section!', anchor: 'sub-section' },
    ])
  })

  it('disambiguates duplicate anchors with -2, -3 suffixes', () => {
    const src = '# Notes\n\n# Notes\n\n# Notes\n'
    const m = parseMarkdownMeta(src, { fields: [] })
    expect(m.headings.map((h) => h.anchor)).toEqual(['notes', 'notes-2', 'notes-3'])
  })

  it('ignores lines inside fenced code blocks that look like headings', () => {
    const src = '# Real\n\n```\n# Not a heading\n```\n'
    const m = parseMarkdownMeta(src, { fields: [] })
    expect(m.headings).toEqual([{ level: 1, text: 'Real', anchor: 'real' }])
  })

  it('strips closing # markers from ATX headings', () => {
    const src = '## Heading ##\n'
    const m = parseMarkdownMeta(src, { fields: [] })
    expect(m.headings[0]).toEqual({ level: 2, text: 'Heading', anchor: 'heading' })
  })

  it('ignores headings inside an unclosed fenced block', () => {
    const src = '# Real\n\n```\n# Not a heading\n'  // no closing ```
    const m = parseMarkdownMeta(src, { fields: [] })
    expect(m.headings).toEqual([{ level: 1, text: 'Real', anchor: 'real' }])
  })
})

describe('parseMarkdownMeta — excerpt', () => {
  it('uses the first paragraph after frontmatter and any leading heading', () => {
    const src = '---\ntitle: T\n---\n# Heading\n\nThis is the first paragraph.\n\nSecond paragraph.\n'
    const m = parseMarkdownMeta(src, { fields: [] })
    expect(m.excerpt).toBe('This is the first paragraph.')
  })

  it('strips markdown emphasis, links, and inline code', () => {
    const src = 'See **bold**, *italic*, [a link](http://x), and `code`.\n'
    const m = parseMarkdownMeta(src, { fields: [] })
    expect(m.excerpt).toBe('See bold, italic, a link, and code.')
  })

  it('truncates at a word boundary near 280 chars and appends an ellipsis', () => {
    const long = ('word '.repeat(200)).trim()
    const m = parseMarkdownMeta(long, { fields: [] })
    expect(m.excerpt.length).toBeLessThanOrEqual(281)
    expect(m.excerpt.endsWith('…')).toBe(true)
    // Does not break in the middle of "word":
    expect(m.excerpt.slice(0, -1)).toMatch(/word$/)
  })

  it('returns "" when there is no body paragraph', () => {
    expect(parseMarkdownMeta('# Heading only\n', { fields: [] }).excerpt).toBe('')
    expect(parseMarkdownMeta('', { fields: [] }).excerpt).toBe('')
  })

  it('does not strip underscores from snake_case identifiers', () => {
    const src = 'See my_snake_case_var in action.\n'
    const m = parseMarkdownMeta(src, { fields: [] })
    expect(m.excerpt).toBe('See my_snake_case_var in action.')
  })
})

describe('parseMarkdownMeta — links and images (opt-in)', () => {
  it('returns links only when "links" is in fields', () => {
    const src = 'See [docs](http://example.com) and ![pic](/p.png).\n'
    const off = parseMarkdownMeta(src, { fields: [] })
    expect(off.links).toBeUndefined()
    const on = parseMarkdownMeta(src, { fields: ['links'] })
    expect(on.links).toEqual([{ text: 'docs', target: 'http://example.com' }])
  })

  it('returns images only when "images" is in fields and includes alt text', () => {
    const src = '![cover](a.png) and ![](b.png) and [link](c).\n'
    const off = parseMarkdownMeta(src, { fields: [] })
    expect(off.images).toBeUndefined()
    const on = parseMarkdownMeta(src, { fields: ['images'] })
    expect(on.images).toEqual([
      { alt: 'cover', src: 'a.png' },
      { alt: '', src: 'b.png' },
    ])
  })

  it('does not classify images as links', () => {
    const src = '![alt](img.png)\n'
    const m = parseMarkdownMeta(src, { fields: ['links', 'images'] })
    expect(m.links).toEqual([])
    expect(m.images).toEqual([{ alt: 'alt', src: 'img.png' }])
  })

  it('de-duplicates identical link {text, target} pairs', () => {
    const src = '[same](x) and again [same](x) and [different](x).\n'
    const m = parseMarkdownMeta(src, { fields: ['links'] })
    expect(m.links).toEqual([
      { text: 'same', target: 'x' },
      { text: 'different', target: 'x' },
    ])
  })

  it('does not collide de-dup on space-shifted text/target pairs', () => {
    const src = '[foo bar](baz) and [foo](bar baz).\n'
    const m = parseMarkdownMeta(src, { fields: ['links'] })
    expect(m.links).toEqual([
      { text: 'foo bar', target: 'baz' },
      { text: 'foo', target: 'bar baz' },
    ])
  })
})

describe('parseMarkdownMeta — code_blocks and todos (opt-in)', () => {
  it('reports fenced code blocks with language and line count', () => {
    const src = '```ts\nconst x = 1\nconst y = 2\n```\n\nprose\n\n```\nplain\n```\n'
    const off = parseMarkdownMeta(src, { fields: [] })
    expect(off.codeBlocks).toBeUndefined()
    const on = parseMarkdownMeta(src, { fields: ['code_blocks'] })
    expect(on.codeBlocks).toEqual([
      { lang: 'ts', lines: 2 },
      { lang: null, lines: 1 },
    ])
  })

  it('handles ~~~ fences as well', () => {
    const src = '~~~py\nprint(1)\n~~~\n'
    const m = parseMarkdownMeta(src, { fields: ['code_blocks'] })
    expect(m.codeBlocks).toEqual([{ lang: 'py', lines: 1 }])
  })

  it('counts open vs done todos', () => {
    const src = '- [ ] one\n- [x] two\n* [X] three\n+ [ ] four\nplain line\n'
    const off = parseMarkdownMeta(src, { fields: [] })
    expect(off.todos).toBeUndefined()
    const on = parseMarkdownMeta(src, { fields: ['todos'] })
    expect(on.todos).toEqual({ open: 2, done: 2 })
  })

  it('ignores would-be todos that lack the leading list marker', () => {
    const src = '[ ] not a todo\n- [ ] real todo\n'
    const m = parseMarkdownMeta(src, { fields: ['todos'] })
    expect(m.todos).toEqual({ open: 1, done: 0 })
  })
})
