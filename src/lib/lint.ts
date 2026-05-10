import type { LintIssue, WorkspaceFiles, LintOptions } from './lintTypes'

/** Markdown link regex: matches [text](target). Not perfect, but good enough for lint. */
const LINK_RE = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
/** Markdown image regex: matches ![alt](target). */
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

const ABSOLUTE_URL_RE = /^([a-z][a-z0-9+.-]*:|#|\/)/i

function joinRel(fileRel: string, target: string): string {
  const cleaned = target.replace(/[#?].*$/, '')
  if (cleaned === '') return cleaned
  const dirSegments = fileRel.split('/').slice(0, -1)
  const targetSegments = cleaned.split('/')
  const out: string[] = [...dirSegments]
  for (const seg of targetSegments) {
    if (seg === '.' || seg === '') continue
    if (seg === '..') {
      out.pop()
      continue
    }
    out.push(seg)
  }
  return out.join('/')
}

function lineOf(text: string, charIndex: number): number {
  let line = 1
  for (let i = 0; i < charIndex && i < text.length; i++) {
    if (text[i] === '\n') line++
  }
  return line
}

export function lintBrokenLinks(
  md: string,
  rel: string,
  files: WorkspaceFiles,
): LintIssue[] {
  const issues: LintIssue[] = []
  const stripped = md.replace(/!\[/g, ' [')
  LINK_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = LINK_RE.exec(stripped)) !== null) {
    const target = m[2]
    if (ABSOLUTE_URL_RE.test(target)) continue
    const resolved = joinRel(rel, target)
    if (!resolved) continue
    if (files.has(resolved)) continue
    issues.push({
      rel,
      line: lineOf(md, m.index),
      match: m[0],
      severity: 'warn',
      rule: 'broken-link',
      message: `Broken link target: ${target}`,
    })
  }
  return issues
}

export function lintFrontMatter(md: string, rel: string): LintIssue[] {
  const lines = md.split('\n')
  if (lines[0] !== '---') return []
  let endIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      endIdx = i
      break
    }
  }
  if (endIdx === -1) {
    return [
      {
        rel,
        line: 1,
        match: '---',
        severity: 'error',
        rule: 'front-matter',
        message: 'Front-matter block is not closed (missing trailing `---`).',
      },
    ]
  }
  const issues: LintIssue[] = []
  for (let i = 1; i < endIdx; i++) {
    const line = lines[i]
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    // Allow YAML list-value continuation lines (e.g. `  - item`).
    if (/^\s*-\s/.test(line)) continue
    if (!/^\s*[A-Za-z0-9_.-]+\s*:\s*\S?.*$/.test(line)) {
      issues.push({
        rel,
        line: i + 1,
        match: line,
        severity: 'error',
        rule: 'front-matter',
        message: `Front-matter line is not in 'key: value' form.`,
      })
    }
  }
  return issues
}

export function lintHeadingSkip(md: string, rel: string): LintIssue[] {
  const issues: LintIssue[] = []
  const lines = md.split('\n')
  let prevLevel = 0
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s{0,3}```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    // Indented code blocks: any line that starts with 4+ spaces or a tab is
    // code, not a heading.
    if (/^(?: {4,}|\t)/.test(line)) continue
    const m = /^(#{1,6})\s+\S/.exec(line)
    if (!m) continue
    const level = m[1].length
    if (prevLevel > 0 && level > prevLevel + 1) {
      issues.push({
        rel,
        line: i + 1,
        match: line,
        severity: 'warn',
        rule: 'heading-skip',
        message: `Heading jumps from H${prevLevel} to H${level} (skipped ${level - prevLevel - 1} level${level - prevLevel - 1 > 1 ? 's' : ''}).`,
      })
    }
    prevLevel = level
  }
  return issues
}

export function lintDeadImages(
  md: string,
  rel: string,
  files: WorkspaceFiles,
): LintIssue[] {
  const issues: LintIssue[] = []
  IMAGE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = IMAGE_RE.exec(md)) !== null) {
    const target = m[2]
    if (ABSOLUTE_URL_RE.test(target)) continue
    const resolved = joinRel(rel, target)
    if (!resolved) continue
    if (files.has(resolved)) continue
    issues.push({
      rel,
      line: lineOf(md, m.index),
      match: m[0],
      severity: 'warn',
      rule: 'dead-image',
      message: `Image target not found: ${target}`,
    })
  }
  return issues
}

export function lintMarkdown(
  md: string,
  rel: string,
  files: WorkspaceFiles,
  opts: LintOptions,
): LintIssue[] {
  const out: LintIssue[] = []
  if (opts.frontMatter) out.push(...lintFrontMatter(md, rel))
  if (opts.headingSkip) out.push(...lintHeadingSkip(md, rel))
  if (opts.brokenLinks) out.push(...lintBrokenLinks(md, rel, files))
  if (opts.deadImages) out.push(...lintDeadImages(md, rel, files))
  out.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule))
  return out
}
