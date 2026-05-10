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
  return {
    frontmatter,
    bodyAfterFrontmatter: body,
    words: 0,
    chars: 0,
    lines: 0,
    paragraphs: 0,
    readingTimeMin: 0,
    headings: [],
    excerpt: '',
  }
}
