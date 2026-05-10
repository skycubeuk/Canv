import { describe, it, expect } from 'vitest'
import { lintBrokenLinks } from './lint'
import { lintFrontMatter } from './lint'
import { lintHeadingSkip } from './lint'
import { lintDeadImages } from './lint'
import { lintMarkdown } from './lint'
import { DEFAULT_LINT_OPTIONS } from './lintTypes'

describe('lintBrokenLinks', () => {
  const files = new Set(['notes/a.md', 'notes/b.md', 'index.md'])

  it('flags relative links that do not resolve to a workspace file', () => {
    const md = 'See [here](missing.md) and [there](notes/a.md).'
    const issues = lintBrokenLinks(md, 'index.md', files)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      rel: 'index.md',
      line: 1,
      match: '[here](missing.md)',
      severity: 'warn',
      rule: 'broken-link',
    })
    expect(issues[0].message).toMatch(/missing\.md/)
  })

  it('ignores absolute URLs (http, https, mailto, tel)', () => {
    const md = '[a](https://e.com) [b](mailto:x@y) [c](tel:1) [d](#anchor)'
    expect(lintBrokenLinks(md, 'index.md', files)).toEqual([])
  })

  it('resolves links relative to the file', () => {
    const md = '[ok](b.md)'
    expect(lintBrokenLinks(md, 'notes/a.md', files)).toEqual([])
  })

  it('reports correct 1-based line number for links on later lines', () => {
    const md = 'first\n\n[bad](nope.md)'
    const issues = lintBrokenLinks(md, 'index.md', files)
    expect(issues[0].line).toBe(3)
  })
})

describe('lintFrontMatter', () => {
  it('passes when there is no front-matter block', () => {
    expect(lintFrontMatter('# hello\nbody', 'a.md')).toEqual([])
  })

  it('passes when front-matter has well-formed key: value lines', () => {
    const md = '---\ntitle: Hello\ndate: 2026-05-01\n---\nbody'
    expect(lintFrontMatter(md, 'a.md')).toEqual([])
  })

  it('flags an unterminated front-matter block as malformed', () => {
    const md = '---\ntitle: Hello\nbody'
    const issues = lintFrontMatter(md, 'a.md')
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      rule: 'front-matter',
      severity: 'error',
      line: 1,
    })
  })

  it('flags a non-key:value line inside the block as malformed', () => {
    const md = '---\ntitle Hello\n---\nbody'
    const issues = lintFrontMatter(md, 'a.md')
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      rule: 'front-matter',
      severity: 'error',
      line: 2,
    })
    expect(issues[0].match).toBe('title Hello')
  })
})

describe('lintHeadingSkip', () => {
  it('passes when headings step by 1', () => {
    const md = '# A\n## B\n### C\n## D\n### E'
    expect(lintHeadingSkip(md, 'a.md')).toEqual([])
  })

  it('passes when re-entering with the same level', () => {
    const md = '# A\n## B\n### C\n## D'
    expect(lintHeadingSkip(md, 'a.md')).toEqual([])
  })

  it('flags H1 -> H3 with no H2 between', () => {
    const md = '# A\n### B'
    const issues = lintHeadingSkip(md, 'a.md')
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      rule: 'heading-skip',
      line: 2,
      match: '### B',
      severity: 'warn',
    })
    expect(issues[0].message).toMatch(/H1.*H3/i)
  })

  it('does not flag a leading H3 (no previous heading)', () => {
    const md = '### First'
    expect(lintHeadingSkip(md, 'a.md')).toEqual([])
  })

  it('ignores headings inside fenced code blocks', () => {
    const md = '# A\n```\n### Not a heading\n```\n## B'
    expect(lintHeadingSkip(md, 'a.md')).toEqual([])
  })
})

describe('lintHeadingSkip — indented code blocks', () => {
  it('ignores headings inside indented code blocks', () => {
    const md = '# A\n\n    ### Not a heading\n\n## B'
    expect(lintHeadingSkip(md, 'a.md')).toEqual([])
  })

  it('still flags real heading skips after an indented code block', () => {
    const md = '# A\n\n    ### Not a heading\n\n#### Real skip'
    const issues = lintHeadingSkip(md, 'a.md')
    expect(issues).toHaveLength(1)
    expect(issues[0].rule).toBe('heading-skip')
  })
})

describe('lintFrontMatter — YAML list values', () => {
  it('accepts indented list-value continuation lines', () => {
    const md = '---\ntags:\n  - foo\n  - bar\n---\nbody'
    expect(lintFrontMatter(md, 'a.md')).toEqual([])
  })
})

describe('lintDeadImages', () => {
  const files = new Set(['notes/a.md', 'images/cover.png', 'images/diagram.svg'])

  it('flags relative image refs that do not resolve', () => {
    const md = '![cover](images/cover.png)\n![missing](images/gone.png)'
    const issues = lintDeadImages(md, 'index.md', files)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      rule: 'dead-image',
      line: 2,
      match: '![missing](images/gone.png)',
      severity: 'warn',
    })
  })

  it('ignores absolute image URLs', () => {
    const md = '![remote](https://e.com/x.png)'
    expect(lintDeadImages(md, 'index.md', files)).toEqual([])
  })

  it('resolves images relative to the source file', () => {
    const md = '![ok](../images/cover.png)'
    expect(lintDeadImages(md, 'notes/a.md', files)).toEqual([])
  })
})

describe('lintMarkdown', () => {
  const files = new Set(['notes/a.md'])
  const md = [
    '---',
    'title Hello',
    '---',
    '# Heading',
    '### Skipped',
    '[bad](missing.md)',
    '![bad](missing.png)',
  ].join('\n')

  it('runs every enabled rule and merges results sorted by line', () => {
    const issues = lintMarkdown(md, 'notes/a.md', files, DEFAULT_LINT_OPTIONS)
    const rules = issues.map((i) => i.rule)
    expect(rules).toContain('front-matter')
    expect(rules).toContain('heading-skip')
    expect(rules).toContain('broken-link')
    expect(rules).toContain('dead-image')
    for (let i = 1; i < issues.length; i++) {
      expect(issues[i].line).toBeGreaterThanOrEqual(issues[i - 1].line)
    }
  })

  it('skips rules disabled in opts', () => {
    const issues = lintMarkdown(md, 'notes/a.md', files, {
      ...DEFAULT_LINT_OPTIONS,
      brokenLinks: false,
      deadImages: false,
    })
    const rules = issues.map((i) => i.rule)
    expect(rules).not.toContain('broken-link')
    expect(rules).not.toContain('dead-image')
    expect(rules).toContain('front-matter')
    expect(rules).toContain('heading-skip')
  })
})
