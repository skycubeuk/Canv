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

export function parseMarkdownMeta(src: string, opts: ParseOpts): ParsedMeta {
  const { frontmatter, body } = splitFrontmatter(src)
  const chars = body.length
  const lines = body.length === 0 ? 0 : (body.match(/\n/g)?.length ?? 0) + 1
  const paragraphs = body.split(/\n\s*\n/).filter((p) => /\S/.test(p)).length
  const words = countWords(body)
  const readingTimeMin = words === 0 ? 0 : Math.max(1, Math.round(words / 200))
  const meta: ParsedMeta = {
    frontmatter,
    bodyAfterFrontmatter: body,
    words,
    chars,
    lines,
    paragraphs,
    readingTimeMin,
    headings: extractHeadings(body),
    excerpt: extractExcerpt(body),
  }
  if (opts.fields.includes('links')) meta.links = extractLinks(body)
  if (opts.fields.includes('images')) meta.images = extractImages(body)
  if (opts.fields.includes('code_blocks')) meta.codeBlocks = extractCodeBlocks(body)
  if (opts.fields.includes('todos')) meta.todos = extractTodos(body)
  return meta
}

// Replace fenced-code regions with same-shape whitespace so headings inside
// them are ignored. Handles both ``` and ~~~ fences, AND unclosed fences
// (which would otherwise leak code into the prose body — important once
// Task 8 truncates large files mid-fence).
function stripFencedBlocks(body: string): string {
  // Closed fences first.
  const closed = body.replace(/(```|~~~)[^\n]*\n[\s\S]*?\n\1[ \t]*(?=\n|$)/g, (m) => m.replace(/[^\n]/g, ' '))
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
  const re = /^(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/
  for (const line of lines) {
    const m = line.match(re)
    if (!m) continue
    const level = m[1].length as 1 | 2 | 3 | 4 | 5 | 6
    const text = m[2]
    if (text === '') continue
    const base = slugify(text)
    const seenCount = seen.get(base) ?? 0
    const anchor = seenCount === 0 ? base : `${base}-${seenCount + 1}`
    seen.set(base, seenCount + 1)
    out.push({ level, text, anchor })
  }
  return out
}

const EXCERPT_LIMIT = 280

function extractExcerpt(body: string): string {
  const stripped = stripFencedBlocks(body)
  const paragraphs = stripped.split(/\n\s*\n/)
  for (const raw of paragraphs) {
    // Drop leading lines that are purely ATX headings.
    const lines = raw.split('\n').filter((l) => !/^#{1,6}\s/.test(l.trim()))
    const joined = lines.join(' ').trim()
    if (joined === '') continue
    return truncateAtWord(stripInlineMarkdown(joined), EXCERPT_LIMIT)
  }
  return ''
}

function stripInlineMarkdown(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')      // images → alt
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')       // links → text
    .replace(/`([^`]+)`/g, '$1')                   // inline code
    .replace(/\*\*([^*]+)\*\*/g, '$1')             // **bold**
    .replace(/__([^_]+)__/g, '$1')                 // __bold__
    .replace(/\*([^*]+)\*/g, '$1')                 // *italic*
    .replace(/(^|[^A-Za-z0-9_])_([^_]+)_(?![A-Za-z0-9_])/g, '$1$2')    // _italic_
}

function truncateAtWord(s: string, limit: number): string {
  if (s.length <= limit) return s
  const slice = s.slice(0, limit + 1)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : slice.slice(0, limit)
  return cut + '…'
}

function extractLinks(body: string): LinkRef[] {
  const stripped = stripFencedBlocks(body)
  // Match [text](target), but not when preceded by '!' (which is an image).
  const re = /(^|[^!])\[([^\]]+)\]\(([^)]+)\)/g
  const seen = new Set<string>()
  const out: LinkRef[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(stripped)) !== null) {
    const ref = { text: m[2], target: m[3] }
    const key = `${ref.text}\0${ref.target}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ref)
  }
  return out
}

function extractImages(body: string): ImageRef[] {
  const stripped = stripFencedBlocks(body)
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g
  const out: ImageRef[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(stripped)) !== null) {
    out.push({ alt: m[1], src: m[2] })
  }
  return out
}

function extractCodeBlocks(body: string): CodeBlock[] {
  const out: CodeBlock[] = []
  const re = /(```|~~~)([^\n]*)\n([\s\S]*?)\n\1[ \t]*(?=\n|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    const info = m[2].trim().split(/\s+/)[0]
    const lang = info === '' ? null : info
    const inner = m[3]
    const lines = inner === '' ? 0 : inner.split('\n').length
    out.push({ lang, lines })
  }
  return out
}

function extractTodos(body: string): TodoCounts {
  const stripped = stripFencedBlocks(body)
  const lines = stripped.split('\n')
  let open = 0
  let done = 0
  const re = /^\s*[-*+]\s+\[( |x|X)\]\s+/
  for (const line of lines) {
    const m = line.match(re)
    if (!m) continue
    if (m[1] === ' ') open++
    else done++
  }
  return { open, done }
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
