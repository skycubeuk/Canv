import { describe, it, expect } from 'vitest'
import { parseOutline } from './outline'

describe('parseOutline', () => {
  it('returns [] for empty input', () => {
    expect(parseOutline('')).toEqual([])
  })

  it('returns [] for text with no headings', () => {
    expect(parseOutline('Just a paragraph.\n\nAnother paragraph.')).toEqual([])
  })

  it('parses a single H1', () => {
    const nodes = parseOutline('# Title')
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({ level: 1, text: 'Title', line: 1, children: [] })
    expect(nodes[0].id).toBe('1:1')
  })

  it('nests H2 under H1', () => {
    const md = '# A\n\n## B\n\n## C\n'
    const nodes = parseOutline(md)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].level).toBe(1)
    expect(nodes[0].children).toHaveLength(2)
    expect(nodes[0].children[0]).toMatchObject({ level: 2, text: 'B', line: 3 })
    expect(nodes[0].children[1]).toMatchObject({ level: 2, text: 'C', line: 5 })
  })

  it('nests H3 under H2 under H1', () => {
    const md = '# A\n\n## B\n\n### C\n'
    const nodes = parseOutline(md)
    expect(nodes[0].children[0].children[0]).toMatchObject({ level: 3, text: 'C', line: 5 })
  })

  it('folds skip-levels under nearest higher heading (#, then ###)', () => {
    const md = '# A\n\n### Deep\n'
    const nodes = parseOutline(md)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].children).toHaveLength(1)
    expect(nodes[0].children[0]).toMatchObject({ level: 3, text: 'Deep', line: 3 })
  })

  it('treats two H1s as siblings', () => {
    const md = '# A\n\n# B\n'
    const nodes = parseOutline(md)
    expect(nodes).toHaveLength(2)
    expect(nodes.map((n) => n.text)).toEqual(['A', 'B'])
  })

  it('excludes headings inside ``` fenced code blocks', () => {
    const md = '# Real\n\n```\n# Not a heading\n## Also not\n```\n\n## Real Two\n'
    const nodes = parseOutline(md)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].text).toBe('Real')
    expect(nodes[0].children).toHaveLength(1)
    expect(nodes[0].children[0].text).toBe('Real Two')
  })

  it('excludes headings inside ~~~ fenced code blocks', () => {
    const md = '# Real\n\n~~~\n# Not a heading\n~~~\n'
    const nodes = parseOutline(md)
    expect(nodes).toHaveLength(1)
    expect(nodes[0].text).toBe('Real')
  })

  it('parses setext headings as level 1 / 2', () => {
    const md = 'Big Title\n=========\n\nSub\n---\n'
    const nodes = parseOutline(md)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({ level: 1, text: 'Big Title', line: 1 })
    expect(nodes[0].children[0]).toMatchObject({ level: 2, text: 'Sub', line: 4 })
  })

  it('strips inline markdown from heading text', () => {
    const md = '## **Bold** and [link](http://x) and `code`'
    const nodes = parseOutline(md)
    expect(nodes[0].text).toBe('Bold and link and code')
  })

  it('produces unique ids for duplicate heading text', () => {
    const md = '## Notes\n\nBody\n\n## Notes\n'
    const nodes = parseOutline(md)
    expect(nodes).toHaveLength(2)
    expect(nodes[0].id).not.toBe(nodes[1].id)
  })

  it('reports correct line numbers after multi-line content', () => {
    const md = 'paragraph one\n\nparagraph two\n\n# Heading\n'
    const nodes = parseOutline(md)
    expect(nodes[0].line).toBe(5)
  })

  it('assigns index in DFS pre-order across the tree', () => {
    const md = '# A\n\n## B\n\n### C\n\n## D\n\n# E\n'
    const nodes = parseOutline(md)
    // Tree:
    //   A (0)
    //     B (1)
    //       C (2)
    //     D (3)
    //   E (4)
    expect(nodes[0].index).toBe(0)
    expect(nodes[0].children[0].index).toBe(1)
    expect(nodes[0].children[0].children[0].index).toBe(2)
    expect(nodes[0].children[1].index).toBe(3)
    expect(nodes[1].index).toBe(4)
  })

  it('index for a single heading is 0', () => {
    const nodes = parseOutline('# Only')
    expect(nodes[0].index).toBe(0)
  })
})
