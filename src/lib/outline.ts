import { lexer } from 'marked'
import type { Token, Tokens } from 'marked'

export interface OutlineNode {
  id: string
  level: 1 | 2 | 3 | 4 | 5 | 6
  text: string
  line: number
  children: OutlineNode[]
}

function isHeading(t: Token): t is Tokens.Heading {
  return t.type === 'heading'
}

// Best-effort inline-markdown stripper: handles common bold/italic/code/link
// forms. Reference-style links, autolinks, and HTML in headings fall through.
function stripInlineMarkdown(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .trim()
}

function countNewlines(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++
  return n
}

interface FlatHeading {
  level: 1 | 2 | 3 | 4 | 5 | 6
  text: string
  line: number
}

function flattenHeadings(text: string): FlatHeading[] {
  const tokens = lexer(text)
  const out: FlatHeading[] = []
  let lineCursor = 1
  for (const tok of tokens) {
    if (isHeading(tok)) {
      // depth is always 1..6 for ATX/setext per CommonMark; clamp defensively
      const depth = Math.min(Math.max(tok.depth, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6
      out.push({
        level: depth,
        text: stripInlineMarkdown(tok.text),
        line: lineCursor,
      })
    }
    lineCursor += countNewlines(tok.raw)
  }
  return out
}

export function parseOutline(text: string): OutlineNode[] {
  if (!text) return []
  const flat = flattenHeadings(text)
  if (flat.length === 0) return []

  const roots: OutlineNode[] = []
  const stack: OutlineNode[] = []

  for (const h of flat) {
    const node: OutlineNode = {
      id: `${h.level}:${h.line}`,
      level: h.level,
      text: h.text,
      line: h.line,
      children: [],
    }
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop()
    }
    if (stack.length === 0) {
      roots.push(node)
    } else {
      stack[stack.length - 1].children.push(node)
    }
    stack.push(node)
  }

  return roots
}
