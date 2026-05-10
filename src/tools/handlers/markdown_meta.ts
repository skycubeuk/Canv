import { parse as parseYaml } from 'yaml'

export type OptionalField = 'links' | 'images' | 'code_blocks' | 'todos'

export interface ParseOpts {
  fields: OptionalField[]
}

export interface Heading { level: 1 | 2 | 3 | 4 | 5 | 6; text: string; anchor: string }
export interface LinkRef { text: string; target: string }
export interface ImageRef { alt: string; src: string }
export interface CodeBlock { lang: string | null; lines: number }
export interface TodoCounts { open: number; done: number }

export interface ParsedMeta {
  frontmatter: Record<string, unknown> | null
  bodyAfterFrontmatter: string
  words: number
  chars: number
  lines: number
  paragraphs: number
  readingTimeMin: number
  headings: Heading[]
  excerpt: string
  links?: LinkRef[]
  images?: ImageRef[]
  codeBlocks?: CodeBlock[]
  todos?: TodoCounts
}

interface FrontmatterSplit {
  frontmatter: Record<string, unknown> | null
  body: string
}

/**
 * Split a markdown source into optional YAML frontmatter + body.
 *
 * Contract: when a well-formed `---` fence pair is found at the start of the
 * file but the YAML between them fails to parse, we return
 * `frontmatter: null` AND a body with the fenced region stripped. This is
 * intentional — the consumer asked for metadata, not prose, so echoing
 * malformed frontmatter back as body content would be wrong. The two
 * outcomes "no frontmatter present" and "frontmatter present but unparseable"
 * both yield `frontmatter: null`; callers that need to distinguish them can
 * compare body length to the input.
 *
 * If `---\n` does not appear at byte 0, the source is returned untouched as
 * the body.
 */
function splitFrontmatter(src: string): FrontmatterSplit {
  // Must start at byte 0 with `---\n`.
  if (!src.startsWith('---\n')) return { frontmatter: null, body: src }
  const closeIdx = src.indexOf('\n---\n', 4)
  // Also accept a closing fence at the very end without trailing newline.
  let endOfClose: number
  let bodyStart: number
  if (closeIdx === -1) {
    if (src.endsWith('\n---')) {
      endOfClose = src.length
      bodyStart = src.length
    } else {
      return { frontmatter: null, body: src }
    }
  } else {
    endOfClose = closeIdx + '\n---\n'.length
    bodyStart = endOfClose
  }
  const yamlText = src.slice(4, closeIdx === -1 ? endOfClose - 4 : closeIdx)
  let parsed: unknown = null
  try {
    parsed = parseYaml(yamlText)
  } catch {
    parsed = null
  }
  const fm = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null
  return { frontmatter: fm, body: src.slice(bodyStart) }
}

// `_opts.fields` will gate the optional `links`/`images`/`code_blocks`/`todos`
// computations in later tasks; for now this scaffold only emits the always-on
// fields, so the parameter is accepted but unused.
export function parseMarkdownMeta(src: string, _opts: ParseOpts): ParsedMeta {
  const { frontmatter, body } = splitFrontmatter(src)
  const chars = body.length
  const lines = body.length === 0 ? 0 : (body.match(/\n/g)?.length ?? 0) + 1
  const paragraphs = body.split(/\n\s*\n/).filter((p) => /\S/.test(p)).length
  const words = countWords(body)
  const readingTimeMin = words === 0 ? 0 : Math.max(1, Math.round(words / 200))
  return {
    frontmatter,
    bodyAfterFrontmatter: body,
    words,
    chars,
    lines,
    paragraphs,
    readingTimeMin,
    headings: extractHeadings(body),
    excerpt: '',
  }
}

// Replace fenced-code regions with same-shape whitespace so headings inside
// them are ignored. Handles both ``` and ~~~ fences, AND unclosed fences
// (which would otherwise leak code into the prose body — important once
// Task 8 truncates large files mid-fence).
function stripFencedBlocks(body: string): string {
  // Closed fences first.
  const closed = body.replace(/(```|~~~)[^\n]*\n[\s\S]*?\n\1/g, (m) => m.replace(/[^\n]/g, ' '))
  // Then any remaining (unclosed) fence runs to EOF.
  return closed.replace(/(```|~~~)[^\n]*\n[\s\S]*$/g, (m) => m.replace(/[^\n]/g, ' '))
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')   // strip non-word, non-space, non-hyphen
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function extractHeadings(body: string): Heading[] {
  const lines = stripFencedBlocks(body).split('\n')
  const out: Heading[] = []
  const seen = new Map<string, number>()
  const re = /^(#{1,6})\s+(.+?)\s*#*\s*$/
  for (const line of lines) {
    const m = line.match(re)
    if (!m) continue
    const level = m[1].length as 1 | 2 | 3 | 4 | 5 | 6
    const text = m[2].trim()
    if (text === '') continue
    const base = slugify(text)
    const seenCount = seen.get(base) ?? 0
    const anchor = seenCount === 0 ? base : `${base}-${seenCount + 1}`
    seen.set(base, seenCount + 1)
    out.push({ level, text, anchor })
  }
  return out
}

function countWords(body: string): number {
  // Strip fenced code blocks (closed and unclosed) via the shared helper.
  const noFences = stripFencedBlocks(body)
  // Strip inline code spans.
  const noInline = noFences.replace(/`[^`]*`/g, ' ')
  // Strip HTML tags (a single pass is enough for word counting).
  const noTags = noInline.replace(/<[^>]+>/g, ' ')
  const tokens = noTags.split(/\s+/).filter((t) => /[A-Za-z0-9]/.test(t))
  return tokens.length
}
